# HWV Ver.3 Backend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci

# Copy backend source
COPY backend/ ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files and install production deps only
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db ./src/db

# Set environment
ENV NODE_ENV=production
ENV PORT=4010

EXPOSE 4010

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4010/health || exit 1

# Run migrations and start server
CMD ["sh", "-c", "npm run migrate && npm start"]
