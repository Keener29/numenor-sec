# Multi-stage Dockerfile for Numenor Security
# Stage 1: Build the application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate types and build the application
RUN npm run typecheck
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S numenor -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Copy built application from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/app ./app

# Copy necessary files
COPY --chown=numenor:nodejs .env.example .env.example
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

# Start the API server
CMD ["npm", "run", "api:dev"]