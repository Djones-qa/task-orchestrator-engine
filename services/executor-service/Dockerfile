# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY services/executor-service/package.json services/executor-service/tsconfig.json ./services/executor-service/

# Install dependencies
RUN npm install --workspace=packages/shared --workspace=services/executor-service

# Copy source code
COPY packages/shared/src ./packages/shared/src
COPY services/executor-service/src ./services/executor-service/src

# Build shared package first, then service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/executor-service

# Stage 2: Production
FROM node:20-alpine AS runtime

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy workspace root package.json for workspace resolution
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/executor-service/package.json ./services/executor-service/

# Install production dependencies only
RUN npm install --workspace=packages/shared --workspace=services/executor-service --omit=dev

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/executor-service/dist ./services/executor-service/dist

USER appuser

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

CMD ["node", "services/executor-service/dist/index.js"]
