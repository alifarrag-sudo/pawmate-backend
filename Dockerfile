FROM node:20-alpine

WORKDIR /app

# Copy everything
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000

# Run migrations then start
CMD ["node", "dist/main"]
