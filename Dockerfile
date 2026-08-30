# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ============================================
# Production stage
# ============================================
FROM node:22-slim AS production

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

WORKDIR /app

# Install OpenSSL
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

# Fix permissions
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Just start the app - no migrations
CMD ["node", "dist/src/main.js"]