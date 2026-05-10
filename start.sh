#!/bin/sh
set -e
echo "Applying migrations..."
npx prisma migrate deploy
echo "Starting server..."
exec node dist/main
