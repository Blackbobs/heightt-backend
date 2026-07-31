#!/bin/bash
# scripts/docker-build.sh

#!/bin/bash
# scripts/docker-build.sh

echo "🚀 Building Heightt API Docker images..."

# Build production image
docker build -t heightt-api:latest -f Dockerfile --target production .

echo "✅ Build complete!"

# Tag for registry (optional)
# docker tag heightt-api:latest your-registry/heightt-api:latest