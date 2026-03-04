# Stage 1: Build dependencies and compile native modules
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies required for native Node addons (e.g. better-sqlite3)
RUN apk add --no-cache python3 make g++ build-base

COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Final lightweight runner
FROM node:18-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy built node_modules and code from builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

EXPOSE 3000

CMD ["node", "src/server.js"]
