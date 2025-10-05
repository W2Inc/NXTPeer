#!/bin/zsh
# ============================================================================
# Startup script for NXTPeer
# ============================================================================

echo "Starting..."
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Please start Docker and try again."
  exit 1
fi

# Build custom Docker image
echo "Building custom Docker image..."
cd "$(dirname "$0")/.."
docker build -t w2inc/runner:latest -f src/docker/Dockerfile src/docker

# # Run database migrations if needed
echo "Running database migrations..."
bunx prisma migrate dev

# Start the application
echo "Starting application..."
bun --bun run --watch src/index.ts
