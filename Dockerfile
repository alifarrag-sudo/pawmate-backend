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

# Apply tracked migrations, then start the app. No `prisma db push` —
# schema changes only land via `prisma migrate deploy` against committed
# migrations, so production state is always reproducible from source.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
