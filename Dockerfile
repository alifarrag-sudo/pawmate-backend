FROM node:20-bullseye-slim

WORKDIR /app

# Copy everything
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build (remove stale incremental build cache first)
COPY . .
RUN rm -f tsconfig.tsbuildinfo && npm run build && ls dist/main.js

EXPOSE 3000

# Run db push to apply schema changes, then start
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main"]
