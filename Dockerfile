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

# Sync schema + apply migrations, then start the app
# db push syncs schema for DBs without migration history (Railway internal PG)
# migrate deploy applies tracked migrations for DBs with history (Supabase)
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss 2>&1 || true && npx prisma migrate deploy 2>&1 || true && node dist/main"]
