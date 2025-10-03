# Docker Setup Guide

This guide explains how to run Numenor Security using Docker for both development and production environments.

## Quick Start

### Development Environment

1. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd clicksafe
   cp docker.env.example .env
   ```

2. **Edit environment variables (optional for testing):**
   ```bash
   nano .env
   ```
   Update the SMTP settings with your email configuration. For testing, you can use the defaults.

3. **Start services:**
   ```bash
   docker-compose up -d
   ```

4. **Access the application:**
   - **Frontend**: http://localhost:3000
   - **API**: http://localhost:3001
   - **API Documentation**: http://localhost:3001/api
   - **Health Check**: http://localhost:3001/health

### Production Environment

1. **Setup production environment:**
   ```bash
   cp docker.env.example .env
   # Edit .env with production values
   nano .env
   ```

2. **Start production services:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

## Docker Services

### Development (`docker-compose.yml`)

- **Frontend**: React Router app on port 3000
- **API**: Express.js server on port 3001
- **PostgreSQL**: Database with persistent storage
- **Redis**: Caching and session storage  
- **Migration**: Automatic database schema setup

### Production (`docker-compose.prod.yml`)

- **Frontend**: React Router app with production optimizations
- **API**: Express.js server with resource limits
- **PostgreSQL**: Database with persistent storage and backups
- **Redis**: Caching and session storage
- **Migration**: Automatic database schema setup
- **Nginx**: Reverse proxy with rate limiting and SSL support

## Environment Variables

### Required Variables

```bash
# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=numenor_security
DB_USER=numenor_user
DB_PASSWORD=your-secure-password

# Application Configuration
NODE_ENV=production
API_PORT=3000

# Security (Generate strong secrets)
JWT_SECRET=your-super-secret-jwt-key
TOKEN_SECRET=your-64-character-hex-secret-key

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Numenor Security <your-email@gmail.com>
```

## Docker Commands

### Development

```bash
# Start all services
docker-compose up -d

# View logs (all services)
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f frontend

# Stop services
docker-compose down

# Rebuild and restart (after code changes)
docker-compose up --build -d

# Access database
docker-compose exec postgres psql -U numenor_user -d numenor_security
```

### Production

```bash
# Start production services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop production services
docker-compose -f docker-compose.prod.yml down

# Backup database
docker-compose -f docker-compose.prod.yml exec app ./backup.sh
```

## Database Management

### Backup

```bash
# Manual backup
docker-compose exec app ./backup.sh

# Automated backup (add to crontab)
0 2 * * * cd /path/to/clicksafe && docker-compose -f docker-compose.prod.yml exec app ./backup.sh
```

### Restore

```bash
# Restore from backup
docker-compose exec postgres psql -U numenor_user -d numenor_security < backup_file.sql
```

## Monitoring

### Health Checks

- **Application**: http://localhost:3000/health
- **Database**: `docker-compose exec postgres pg_isready`
- **Redis**: `docker-compose exec redis redis-cli ping`

### Logs

```bash
# Application logs
docker-compose logs -f app

# Database logs
docker-compose logs -f postgres

# All services
docker-compose logs -f
```

## Security Considerations

### Production Security

1. **Change default passwords** in production environment
2. **Use strong secrets** for JWT_SECRET and TOKEN_SECRET
3. **Enable SSL/TLS** by configuring nginx with certificates
4. **Restrict database access** (don't expose ports in production)
5. **Regular backups** and test restore procedures

### Environment Variables

- Never commit `.env` files to version control
- Use different secrets for development and production
- Rotate secrets regularly
- Use environment-specific configuration files

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
# Check what's using the port
lsof -i :3000
lsof -i :5432
```

**Database connection issues:**
```bash
# Check database logs
docker-compose logs postgres

# Test connection
docker-compose exec app npm run db:migrate
```

**Application not starting:**
```bash
# Check application logs
docker-compose logs app

# Rebuild the image
docker-compose up --build -d
```

### Performance Optimization

**Resource Limits:**
- Adjust memory and CPU limits in `docker-compose.prod.yml`
- Monitor resource usage with `docker stats`

**Database Optimization:**
- Tune PostgreSQL settings for your workload
- Monitor query performance
- Regular VACUUM and ANALYZE operations

## Next Steps

1. **SSL Configuration**: Set up SSL certificates for HTTPS
2. **Monitoring**: Add application monitoring (Prometheus, Grafana)
3. **Logging**: Centralized logging with ELK stack
4. **Scaling**: Horizontal scaling with load balancers
5. **CI/CD**: Automated deployment pipelines
