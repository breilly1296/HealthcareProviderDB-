# ================================
# Dependencies stage
# ================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

# Copy root package files for workspaces
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

# Create directories so npm recognizes workspaces
RUN mkdir -p packages/shared packages/frontend

# Install all dependencies
RUN npm install --force

# ================================
# Build stage
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy package files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend

# Build shared package first
RUN cd packages/shared && npm run build

# Set environment variables for build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build Next.js app
RUN ln -s /app/node_modules /app/packages/frontend/node_modules
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd packages/frontend && npm run build

# ================================
# Production stage
# ================================
FROM node:20-alpine AS runner

WORKDIR /app

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone build
COPY --from=builder /app/packages/frontend/.next/standalone ./
COPY --from=builder /app/packages/frontend/.next/static ./packages/frontend/.next/static
COPY --from=builder /app/packages/frontend/public ./packages/frontend/public

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

# Expose port (Cloud Run uses 8080 by default)
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

# Start the server
CMD ["node", "packages/frontend/server.js"]
