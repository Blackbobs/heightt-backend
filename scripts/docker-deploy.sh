#!/bin/bash
# scripts/docker-deploy.sh

#!/bin/bash

echo "🚀 Deploying Heightt API with Docker Compose..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found! Please create one from .env.example"
    exit 1
fi

# Pull latest images
echo "📦 Pulling latest images..."
docker compose pull

# Build and start containers
echo "🏗️ Building and starting containers..."
docker compose up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Run migrations
echo "🔄 Running database migrations..."
docker compose run --rm migrate

# Check status
echo "📊 Service status:"
docker compose ps

echo "✅ Deployment complete!"
echo "📚 API Documentation: http://localhost:3000/api/docs"
echo "🔍 Health Check: http://localhost:3000/health"