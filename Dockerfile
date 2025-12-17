# Multi-stage Dockerfile for Frontend (standalone React Router service)

# ================================
# Stage 1: Build the application
# ================================
FROM node:20-alpine AS builder

# Accept build arguments for Vite environment variables
# These are injected at build time and baked into the frontend bundle
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_URL
ARG VITE_AZURE_CLIENT_ID
ARG VITE_AZURE_REDIRECT_URI
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID
ENV VITE_AZURE_REDIRECT_URI=$VITE_AZURE_REDIRECT_URI

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --ignore-scripts

# Copy source code (excluding API backend - frontend only)
COPY app/routes ./app/routes
COPY app/components ./app/components
COPY app/utils ./app/utils
COPY app/hooks ./app/hooks
COPY app/root.tsx ./app/root.tsx
COPY app/routes.ts ./app/routes.ts
COPY app/app.css ./app/app.css
COPY app/msalConfig.ts ./app/msalConfig.ts
COPY public ./public
COPY react-router.config.ts ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY tsconfig.json ./
COPY tsconfig.test.json ./

# Generate types and build the application
RUN npm run typecheck
RUN npm run build

# ================================
# Stage 2: Production image
# ================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser -S numenor -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts --only=production && npm prune --production

# Copy built application from builder stage
COPY --from=builder /app/build ./build

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
