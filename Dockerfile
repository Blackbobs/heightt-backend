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

# Copy scripts to dist (they won't be compiled, but will be available)
RUN cp -r scripts/ dist/scripts/

# Prune dev dependencies
RUN npm prune --production

# ============================================
# Production stage
# ============================================
FROM node:22-slim AS production

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy all files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
USER nodejs

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/scripts/start.js"]