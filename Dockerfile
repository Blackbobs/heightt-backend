# Build stage - Use Node.js 22 Alpine
FROM node:22-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install dependencies with config flags
RUN pnpm install --frozen-lockfile \
    --config.confirmModulesPurge=false \
    --config.enable-pre-post-scripts=true \
    --config.auto-install-peers=true \
    --config.ignore-scripts=false

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# ============================================
# Production stage
# ============================================
FROM node:22-alpine AS production

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile \
    --config.confirmModulesPurge=false \
    --config.enable-pre-post-scripts=true \
    --config.auto-install-peers=true \
    --config.ignore-scripts=false

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start the application
CMD ["node", "dist/main"]