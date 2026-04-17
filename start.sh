#!/bin/sh
echo "Running prisma db push..."
npx prisma db push --accept-data-loss || echo "Schema push failed or already in sync, continuing..."
echo "Starting server..."
exec node dist/main
