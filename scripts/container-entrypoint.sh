#!/bin/sh
set -eu

max_attempts="${DB_MIGRATION_MAX_ATTEMPTS:-20}"
attempt=1

while [ "$attempt" -le "$max_attempts" ]; do
  if bun run db:migrate; then
    exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000
  fi

  echo "Migration attempt ${attempt}/${max_attempts} failed; retrying in 2s..."
  attempt=$((attempt + 1))
  sleep 2
done

echo "Database migrations failed after ${max_attempts} attempts."
exit 1
