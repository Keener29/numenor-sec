# Nginx Setup Guide

This guide explains how to use the `nginx.conf` file for your Numenor Security application.

---

## Quick Start

### Production (with Docker Compose)

Your `docker-compose.prod.yml` already has nginx configured! Just follow these steps:

1. **Set up SSL certificates**
2. **Start the services**

---

## Step-by-Step Setup

### 1. SSL Certificates Setup

#### Option A: Let's Encrypt (Recommended for Production)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Get certificates
sudo certbot certonly --standalone -d numenorsecurity.com

# Certificates will be in:
# /etc/letsencrypt/live/numenorsecurity.com/fullchain.pem
# /etc/letsencrypt/live/numenorsecurity.com/privkey.pem
```

#### Option B: Self-Signed (Development/Testing)

```bash
# Create ssl directory
mkdir -p ssl

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=numenorsecurity.com"
```

#### Option C: Use Existing Certificates

Place your certificates in the `ssl/` directory:
```bash
mkdir -p ssl
cp your-cert.pem ssl/cert.pem
cp your-key.pem ssl/key.pem
```

---

### 2. Update Docker Compose

#### For Production (`docker-compose.prod.yml`)

The nginx service is already configured! Just ensure:

1. **SSL certificates are mounted correctly** (already done):
   ```yaml
   volumes:
     - ./nginx.conf:/etc/nginx/nginx.conf:ro
     - ./ssl:/etc/nginx/ssl:ro
   ```

2. **Update app service** - Remove direct port exposure (nginx handles it):
   ```yaml
   app:
     # Remove or comment out:
     # ports:
     #   - "3000:3000"
   ```

#### For Development (`docker-compose.yml`)

Add nginx service to development compose file:

```yaml
  # Nginx Reverse Proxy (for development with HTTPS testing)
  nginx:
    image: nginx:alpine
    container_name: numenor-nginx-dev
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
      - frontend
    networks:
      - numenor-network
    restart: unless-stopped
```

---

### 3. Start Services

#### Production

```bash
# Set environment variables
export DB_PASSWORD=your_secure_password
export DB_USER=numenor_app
export JWT_SECRET=your_jwt_secret
# ... other env vars

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check nginx logs
docker logs numenor-nginx
```

#### Development

```bash
# Start all services including nginx
docker-compose up -d

# Check nginx logs
docker logs numenor-nginx-dev
```

---

## Configuration Details

### Port Mapping

- **Port 80 (HTTP)**: Redirects to HTTPS
- **Port 443 (HTTPS)**: Serves your application

### Upstream Configuration

Nginx proxies to your app container:
```nginx
upstream app {
    server app:3000;  # Your backend app container/service
}
```

**Important**: Make sure your app service name matches:
- Production: `app` (from docker-compose.prod.yml)
- Development: Update to match your service name (`api` or `frontend`)

---

## Testing

### 1. Test HTTP → HTTPS Redirect

```bash
# Should redirect to HTTPS
curl -I http://localhost

# Expected response:
# HTTP/1.1 301 Moved Permanently
# Location: https://localhost/
```

### 2. Test HTTPS Connection

```bash
# Test HTTPS endpoint
curl -k https://localhost/health

# Test API endpoint
curl -k https://localhost/api
```

### 3. Verify SSL Certificate

```bash
# Check certificate (production)
openssl s_client -connect numenorsecurity.com:443 -servername numenorsecurity.com

# Check certificate (local)
openssl s_client -connect localhost:443
```

### 4. Test Rate Limiting

```bash
# Should work fine
for i in {1..10}; do curl -k https://localhost/api/health; done

# Should get rate limited after many requests
for i in {1..150}; do curl -k https://localhost/api/health; done
```

---

## Troubleshooting

### Issue: SSL Certificate Not Found

**Error**: `SSL_CTX_use_certificate_file("/etc/nginx/ssl/cert.pem") failed`

**Solution**:
```bash
# Check if certificates exist
ls -la ssl/

# Ensure certificates are readable
chmod 644 ssl/cert.pem
chmod 600 ssl/key.pem

# Verify mount in Docker
docker exec numenor-nginx ls -la /etc/nginx/ssl/
```

### Issue: 502 Bad Gateway

**Error**: `502 Bad Gateway` when accessing through nginx

**Solution**:
1. Check if app container is running:
   ```bash
   docker ps | grep app
   ```

2. Check app logs:
   ```bash
   docker logs numenor-app-prod
   ```

3. Verify upstream name matches service name in docker-compose

4. Test app directly (bypass nginx):
   ```bash
   docker exec numenor-app-prod wget -qO- http://localhost:3000/health
   ```

### Issue: OCSP Stapling Errors

**Error**: `OCSP_basic_verify() failed` in nginx logs

**Solution**: 
- This is normal for self-signed certificates
- For production, ensure your CA provides OCSP
- To disable temporarily, comment out OCSP lines in nginx.conf

### Issue: Rate Limiting Too Strict

**Solution**: Adjust limits in nginx.conf:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
# Change rate=10r/s to rate=20r/s for more lenient
```

---

## Development vs Production

### Development

- Use self-signed certificates (browser will show warning - accept it)
- Can disable HTTPS redirect temporarily
- Use `localhost` as server_name

### Production

- Use Let's Encrypt or commercial SSL certificates
- Always redirect HTTP → HTTPS
- Use actual domain name (`numenorsecurity.com`)
- Monitor logs regularly

---

## Security Checklist

- [ ] SSL certificates are valid and not expired
- [ ] Private key has correct permissions (600)
- [ ] HTTP → HTTPS redirect is working
- [ ] HSTS header is present
- [ ] Rate limiting is active
- [ ] Security headers are present
- [ ] Logs are being monitored
- [ ] Certificates are auto-renewing (if using Let's Encrypt)

---

## Advanced: Auto-Renewal (Let's Encrypt)

Set up automatic certificate renewal:

```bash
# Add to crontab
0 0 * * * certbot renew --quiet --deploy-hook "docker restart numenor-nginx"
```

Or use a Docker container for automatic renewal:
```yaml
certbot:
  image: certbot/certbot
  volumes:
    - ./ssl:/etc/letsencrypt
  command: certonly --webroot -w /var/www/certbot --email your@email.com -d numenorsecurity.com --agree-tos --non-interactive
```

---

## Monitoring

### View Nginx Logs

```bash
# Access logs
docker exec numenor-nginx tail -f /var/log/nginx/access.log

# Error logs
docker exec numenor-nginx tail -f /var/log/nginx/error.log

# Or mount logs to host
# Add to docker-compose volumes:
# - ./logs/nginx:/var/log/nginx
```

### Check Nginx Status

```bash
# Test configuration
docker exec numenor-nginx nginx -t

# Reload configuration (without downtime)
docker exec numenor-nginx nginx -s reload
```

---

## Next Steps

1. ✅ Set up SSL certificates
2. ✅ Update docker-compose files
3. ✅ Test HTTP → HTTPS redirect
4. ✅ Verify rate limiting works
5. ✅ Monitor logs
6. ✅ Set up certificate auto-renewal (production)

---

## Quick Reference

| Task | Command |
|------|---------|
| Start services | `docker-compose -f docker-compose.prod.yml up -d` |
| View nginx logs | `docker logs numenor-nginx` |
| Test config | `docker exec numenor-nginx nginx -t` |
| Reload config | `docker exec numenor-nginx nginx -s reload` |
| Check SSL | `openssl s_client -connect localhost:443` |

