#!/bin/sh
set -e

# Run database migrations before starting the server
# This is necessary for Render free tier (no shell/background workers)
echo "Running database migrations..."
if npm run db:migrate; then
  echo "✓ Migrations completed successfully"
else
  echo "⚠ Warning: Migrations failed, but continuing to start server..."
  echo "⚠ You may need to run migrations manually if this persists"
fi

# Start the API server
echo "Starting API server..."
exec "$@"
