# Build stage
FROM docker.io/library/node:24-alpine AS builder

WORKDIR /app

# Copy package manager files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install pnpm and dependencies
# Pinned to match the "packageManager" field in package.json: installing
# unpinned "pnpm" resolves to pnpm 11, which delegates to the pinned version
# via a platform-specific @pnpm/exe.* package that has no 10.x release for
# musl/Alpine, breaking `pnpm install` here (see pnpm/pnpm#13622).
RUN npm install -g pnpm@10.18.3
RUN pnpm install --frozen-lockfile

# Copy source code but ignore node_modules and .next directories
COPY . .

# Build the application
RUN pnpm build

# Production stage
FROM docker.io/library/node:24-alpine

WORKDIR /app

# Install pnpm and curl for healthchecks
# Pinned to match the builder stage (see comment above) to avoid the
# musl/Alpine pnpm 11 delegation failure.
RUN npm install -g pnpm@10.18.3 && apk add --no-cache curl

# Copy package manager files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Expose port
EXPOSE 3000

# Bind to all interfaces
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Start the application
CMD ["node", "server.js"]