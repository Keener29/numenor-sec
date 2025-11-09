# Multi-stage Dockerfile for Numenor Security

# ================================
# Stage 1: Build the application
# ================================
FROM node:20-alpine AS builder

# Accept build arguments for Vite environment variables
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code (including .env if it exists)
COPY . .

# Generate types and build the application
RUN npm run typecheck
RUN npm run build

# ================================
# Stage 2: Production image
# ================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S numenor -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm prune --production

# Copy built application from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/app ./app

COPY --chown=numenor:nodejs README.md README.md
COPY --chown=numenor:nodejs EMAIL_SETUP.md EMAIL_SETUP.md
COPY --chown=numenor:nodejs SECURE_EMAIL_APPROVAL.md SECURE_EMAIL_APPROVAL.md


# Create logs directory
RUN mkdir -p /app/logs && chown -R numenor:nodejs /app/logs

# Switch to non-root user
USER numenor

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

CMD ["npm", "start"]
