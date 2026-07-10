# Build stage
FROM docker.io/library/node:24-alpine AS builder

WORKDIR /app

# Copy package manager files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code but ignore node_modules and .next directories
COPY . .

# Build the application
RUN pnpm build

# Production stage
FROM docker.io/library/node:24-alpine

WORKDIR /app

# Install pnpm and curl for healthchecks
RUN npm install -g pnpm && apk add --no-cache curl

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