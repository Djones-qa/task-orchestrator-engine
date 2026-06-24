# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY services/scheduler-api/package.json services/scheduler-api/tsconfig.json ./services/scheduler-api/

# Install dependencies
RUN npm install --workspace=packages/shared --workspace=services/scheduler-api

# Copy source code
COPY packages/shared/src ./packages/shared/src
COPY services/scheduler-api/src ./services/scheduler-api/src

# Build shared package first, then service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/scheduler-api

# Stage 2: Production
FROM node:20-alpine AS runtime

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy workspace root package.json for workspace resolution
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/scheduler-api/package.json ./services/scheduler-api/

# Install production dependencies only
RUN npm install --workspace=packages/shared --workspace=services/scheduler-api --omit=dev

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/scheduler-api/dist ./services/scheduler-api/dist

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "services/scheduler-api/dist/index.js"]
