# HWV Ver.3 Backend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy backend source
COPY backend/ ./

# Build TypeScript (includes copying schema.sql to dist)
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files and install production deps only
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder (includes schema.sql in dist/db)
COPY --from=builder /app/dist ./dist

# Set environment (PORT is provided by Railway)
ENV NODE_ENV=production

# Run migrations and start server
CMD ["sh", "-c", "npm run migrate:prod && npm start"]
