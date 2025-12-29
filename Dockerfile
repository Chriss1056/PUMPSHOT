# ======= Stage 1: Build =======
FROM node:22-alpine AS builder

# Install system dependencies needed for build
RUN apk add --no-cache openssl git

WORKDIR /app

# Copy package.json only
COPY package.json ./

# Generate package-lock.json if it doesn't exist
RUN npm install --package-lock-only --ignore-scripts

# Install all dependencies (including dev) for building
RUN npm ci && npm cache clean --force

# Copy the rest of the source code
COPY . .

# Build the app
RUN npm run build

# ======= Stage 2: Production =======
FROM node:22-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

# Copy package files and lockfile from builder
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Optional: remove CLI packages to reduce size
RUN npm remove @shopify/cli || true

# Copy built files from builder
COPY --from=builder /app/dist ./dist  # Adjust if your build output is elsewhere

# Expose the port
EXPOSE 3000

# Start the app
CMD ["npm", "run", "docker-start"]
