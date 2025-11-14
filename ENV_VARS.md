# Environment Variables - Numenor Security

Complete list of environment variables required for deployment.

## API Service (`numenor-api`)

### Database Configuration
```bash
DB_HOST=postgres                    # Database hostname
DB_PORT=5432                        # Database port
DB_NAME=numenor_security            # Database name
DB_USER=numenor_user                # Database username
DB_PASSWORD=your_password           # Database password (keep secret!)
```

### Application Configuration
```bash
NODE_ENV=production                 # Environment: production, development, test
API_PORT=3000                       # Port API listens on (default: 3000)
```

### Security Secrets
```bash
JWT_SECRET=your-jwt-secret          # Secret for JWT token signing (generate strong random string)
TOKEN_SECRET=your-token-secret      # Secret for token encryption (generate strong random string)
```

**Generate secrets**:
```bash
# Generate a strong random secret (use this for both)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Email Configuration (SMTP)
```bash
SMTP_HOST=smtp.gmail.com            # SMTP server hostname
SMTP_PORT=587                       # SMTP port (587 for TLS, 465 for SSL)
SMTP_SECURE=false                   # Use TLS (false for port 587, true for 465)
SMTP_USER=your-email@gmail.com      # SMTP username
SMTP_PASS=your-app-password         # SMTP password or app-specific password
SMTP_FROM=noreply@yourdomain.com    # From address for emails
PROCESSED_EMAIL_RETENTION_HOURS=24  # Hours to retain processed emails (default: 24)
```

### Google OAuth Configuration
```bash
GOOGLE_CLIENT_ID=your-client-id     # Google OAuth client ID
GOOGLE_CLIENT_SECRET=your-secret    # Google OAuth client secret
GOOGLE_REDIRECT_URI=https://your-api-domain.com/api/oauth/gmail/callback
FRONTEND_URL=https://your-frontend-domain.com
```

### WHOIS API Configuration (Optional)
```bash
WHOIS_JSON_API_KEY=your-key         # WHOIS JSON API key (optional)
WHOIS_XML_API_KEY=your-key          # WHOIS XML API key (optional)
```

---

## Frontend Service (`numenor-frontend`)

### Application Configuration
```bash
NODE_ENV=production                 # Environment: production, development
API_URL=https://your-api-domain.com # Backend API URL (must be HTTPS in production)
VITE_GOOGLE_CLIENT_ID=your-id      # Google OAuth client ID (for frontend)
```

**Note**: `VITE_GOOGLE_CLIENT_ID` is baked into the frontend build at build time. Update this in GitHub Secrets if you change it.

---

## Migration Service (`numenor-migrate`)

### Database Configuration
```bash
DB_HOST=postgres                    # Database hostname
DB_PORT=5432                        # Database port
DB_NAME=numenor_security            # Database name
DB_USER=numenor_user                # Database username
DB_PASSWORD=your_password           # Database password
```

**Note**: Migration service only needs database connection variables. It runs once per deployment.

---

## Redis (Optional)

If using Redis for caching:

```bash
REDIS_HOST=redis                    # Redis hostname
REDIS_PORT=6379                     # Redis port
REDIS_PASSWORD=                     # Redis password (if set)
```

---

## Environment-Specific Examples

### Development (docker-compose.yml)
```yaml
environment:
  NODE_ENV: development
  DB_HOST: postgres
  DB_PORT: 5432
  # ... etc
```

### Production (Render/Railway)
```bash
NODE_ENV=production
DB_HOST=${{Postgres.PGHOST}}        # Railway variable reference
# ... etc
```

---

## Required vs Optional

### Required (API)
- ✅ `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- ✅ `JWT_SECRET`, `TOKEN_SECRET`
- ✅ `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`
- ✅ `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

### Required (Frontend)
- ✅ `API_URL`
- ✅ `VITE_GOOGLE_CLIENT_ID` (build-time)

### Optional
- ⚪ `WHOIS_JSON_API_KEY`, `WHOIS_XML_API_KEY` (enhanced domain analysis)
- ⚪ `REDIS_HOST`, `REDIS_PORT` (caching)
- ⚪ `PROCESSED_EMAIL_RETENTION_HOURS` (defaults to 24)

---

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use strong random secrets** for JWT_SECRET and TOKEN_SECRET
3. **Rotate secrets regularly** (especially after team member changes)
4. **Use environment-specific values** (different secrets for dev/staging/prod)
5. **Restrict database access** to only necessary services
6. **Use HTTPS** for all production URLs (FRONTEND_URL, GOOGLE_REDIRECT_URI)
7. **Enable SMTP authentication** and use app-specific passwords for Gmail

---

## Validation

The API validates required environment variables on startup. Missing required variables will cause the service to fail with clear error messages.

Check logs if services fail to start:
```bash
# Render
render logs --service numenor-api

# Railway
railway logs --service numenor-api
```

