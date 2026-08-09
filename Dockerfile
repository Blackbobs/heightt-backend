# Build stage - use non-root user from the start
FROM node:22-slim AS builder

# Create non-root user first
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

WORKDIR /app

# Copy package files and set ownership
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs prisma ./prisma/

# Switch to non-root user
USER nodejs

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY --chown=nodejs:nodejs . .

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

# Copy all files with correct ownership
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/scripts ./scripts

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "scripts/start.js"]