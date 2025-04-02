# Docker Setup for Banking Ledger API

This directory contains Docker configuration for running the Banking Ledger API in both development and production environments.

## Development Environment

The development environment uses `docker-compose.yml` with hot-reloading for rapid development.

### Features

- Hot reloading with nodemon
- MongoDB with replica set (for transaction support)
- MongoDB Express UI for database management
- Volume mapping for code changes
- Development-specific environment variables

### Setup

1. Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

2. Start the development environment:

```bash
docker-compose up
```

3. The API will be available at `http://localhost:3000`
4. MongoDB Express UI will be available at `http://localhost:8081`

## Production Environment

The production environment uses `docker-compose.prod.yml` with optimized settings for security and performance.

### Features

- Multi-stage build for smaller image size
- Non-root user for security
- Resource limits for containers
- Clustering support for multi-core utilization
- Health checks for reliability
- MongoDB authentication
- Log rotation and management
- Network isolation

### Setup

1. Create a `.env.prod` file with production settings:

```bash
cp .env.example .env.prod
# Edit .env.prod with secure production values
```

2. Build and start the production environment:

```bash
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

3. Check container status:

```bash
docker-compose -f docker-compose.prod.yml ps
```

## MongoDB Configuration

### Replica Set

MongoDB is configured as a replica set to support transactions, which are required for the double-entry accounting system.

- Development: Single-node replica set with no authentication
- Production: Single-node replica set with authentication enabled

### Database Initialization

The `init.js` script creates:

- Collections with schema validation
- Indexes for performance optimization
- Initial system information

### User Management

- Development: No authentication
- Production: 
  - Root admin user (created via environment variables)
  - Application user with specific permissions

## Common Operations

### Viewing Logs

```bash
# Development
docker-compose logs -f api

# Production
docker-compose -f docker-compose.prod.yml logs -f api
```

### Accessing MongoDB Shell

```bash
# Development
docker-compose exec mongodb mongosh

# Production
docker-compose -f docker-compose.prod.yml exec mongodb mongosh -u $MONGO_USERNAME -p $MONGO_PASSWORD --authenticationDatabase admin
```

### Scaling API Instances (Production)

```bash
docker-compose -f docker-compose.prod.yml up -d --scale api=3
```

### Rebuilding After Code Changes

```bash
# Development (no rebuild needed - volumes mounted)
# Just restart if package.json changes
docker-compose restart api

# Production
docker-compose -f docker-compose.prod.yml build api
docker-compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### MongoDB Replica Set Issues

If MongoDB fails to initialize the replica set:

```bash
# Force re-initialize replica set
docker-compose exec mongodb mongosh --eval "rs.status()"
docker-compose exec mongo-setup /bin/bash /setup.sh
```

### Container Health Checks

View container health status:

```bash
docker-compose ps
# or
docker ps
```

