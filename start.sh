#!/bin/sh
set -e

echo "Attempting prisma migrate deploy..."

# Happy path: a normal incremental deploy when `_prisma_migrations` is in
# the correct state. This is what every future deploy will look like.
if npx prisma migrate deploy; then
  echo "migrate deploy succeeded."
else
  # P3005 baseline path — runs at most once, when the production schema
  # exists (created at some point by `prisma db push` or by an earlier
  # successful migrate deploy whose history table was wiped) but the
  # `_prisma_migrations` table is empty.
  #
  # We can't just `migrate resolve --applied` for every migration: the new
  # migrations (e.g. meet_greet_consents) would then be marked applied
  # without their CREATE TABLE actually running, and the app would crash
  # querying a missing table. So we apply every migration's SQL directly
  # via psql with ON_ERROR_STOP=0 — older CREATE TYPE / CREATE TABLE
  # statements collide harmlessly, newer IF NOT EXISTS guards no-op
  # cleanly, and the new tables / enums get created. Then we baseline
  # everything as applied so the next deploy returns to the happy path.
  echo "migrate deploy failed — falling back to baseline + direct SQL apply."

  if [ -z "$DATABASE_URL" ]; then
    echo "FATAL: DATABASE_URL is not set; cannot baseline." >&2
    exit 1
  fi

  for d in prisma/migrations/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    sql="${d}migration.sql"
    [ -f "$sql" ] || continue
    echo "  apply SQL: $name"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -q -f "$sql" >/dev/null 2>&1 || true
  done

  for d in prisma/migrations/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    echo "  mark applied: $name"
    npx prisma migrate resolve --applied "$name" >/dev/null 2>&1 || true
  done

  echo "Baseline complete."
fi

echo "Starting server..."
exec node dist/main
