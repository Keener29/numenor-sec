# Render Deployment Guide

This guide explains how to deploy Numenor Security to Render as two separate services: one for the backend API and one for the frontend.

## Architecture Overview

- **Backend Service**: Express.js API server (Dockerfile.api)
- **Frontend Service**: React Router application (Dockerfile)

Both services are deployed independently and communicate over HTTPS.

## Prerequisites

1. Render account (https://render.com)
2. PostgreSQL database (Render PostgreSQL service or external)
3. Environment variables configured

## Step 1: Deploy Backend API Service

### 1.1 Create New Web Service

1. Go to Render Dashboard → New → Web Service
2. Connect your GitHub repository
3. Configure the service:

**Basic Settings:**

- **Name**: `numenor-api` (or your preferred name)
- **Environment**: Docker
- **Region**: Choose closest to your users
- **Branch**: `main` (or your production branch)
- **Root Directory**: Leave empty (root of repo)

**Docker Settings:**

- **Dockerfile Path**: `Dockerfile.api`
- **Docker Context**: `.` (root directory)

**Environment Variables:**
Add the following environment variables:

```bash
# Application Configuration
NODE_ENV=production
PORT=10000
# Note: Render sets PORT automatically, but you can override

# Database Configuration
DB_HOST=your-postgres-host.onrender.com
DB_PORT=5432
DB_NAME=numenor_security
DB_USER=numenor_user
DB_PASSWORD=your-secure-password
DB_SSL=true

# Security (Generate strong secrets)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
TOKEN_SECRET=your-super-secret-token-key-min-32-chars

# CORS Configuration (comma-separated list)
CORS_ORIGINS=https://numenorsecurity.com,https://www.numenorsecurity.com

# Frontend URL (for OAuth redirects and email links)
FRONTEND_URL=https://www.numenorsecurity.com

# Email Configuration
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@numenorsecurity.com
PROCESSED_EMAIL_RETENTION_HOURS=168

# Gmail OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://your-api-service.onrender.com/api/oauth/gmail/callback

# WHOIS API Configuration (optional)
WHOIS_JSON_API_KEY=your-whois-json-api-key
WHOIS_XML_API_KEY=your-whois-xml-api-key
```

**Advanced Settings:**

- **Health Check Path**: `/health`
- **Auto-Deploy**: Yes (recommended)

### 1.2 Deploy and Note the URL

After deployment, Render will assign a URL like:

- `https://numenor-api.onrender.com` (or your custom domain)

**Save this URL** - you'll need it for the frontend configuration.

## Step 2: Deploy Frontend Service

### 2.1 Create New Web Service

1. Go to Render Dashboard → New → Web Service
2. Connect the same GitHub repository
3. Configure the service:

**Basic Settings:**

- **Name**: `numenor-frontend` (or your preferred name)
- **Environment**: Docker
- **Region**: Same as backend (for lower latency)
- **Branch**: `main` (or your production branch)
- **Root Directory**: Leave empty

**Docker Settings:**

- **Dockerfile Path**: `Dockerfile`
- **Docker Context**: `.` (root directory)

**Build Command:**
Leave empty (handled by Dockerfile)

**Start Command:**
Leave empty (handled by Dockerfile)

**Environment Variables:**
Add the following environment variables:

```bash
# Build-time variables (baked into frontend bundle)
# These MUST be set BEFORE the first build
VITE_API_URL=https://your-api-service.onrender.com/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id

# Runtime (optional, for reference)
NODE_ENV=production
```

**Important**: `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID` are build-time variables:

1. Set them in Render Dashboard → Environment → Environment Variables
2. Render automatically makes them available during Docker build
3. They are baked into the frontend bundle at build time
4. **You must set `VITE_API_URL` AFTER deploying the backend** to get the correct URL
5. If you change these values, you must rebuild the frontend service

**Advanced Settings:**

- **Health Check Path**: `/` (or leave empty)
- **Auto-Deploy**: Yes

### 2.2 Configure Custom Domain (Optional)

1. Go to Settings → Custom Domains
2. Add your domain: `www.numenorsecurity.com`
3. Follow Render's DNS instructions
4. Render will provision SSL automatically

## Step 3: Database Setup

### Option A: Render PostgreSQL (Recommended)

1. Create PostgreSQL service in Render
2. Note the connection details
3. Update backend environment variables with these details

### Option B: External PostgreSQL

1. Use your existing PostgreSQL instance
2. Ensure it's accessible from Render (whitelist Render IPs if needed)
3. Update backend environment variables

### Run Database Migrations

After backend is deployed, run migrations:

1. SSH into backend service (or use Render Shell)
2. Run: `npm run db:migrate`

Or create a one-time job in Render:

- **Type**: Background Worker
- **Command**: `npm run db:migrate`
- **Environment**: Same as backend service

## Step 4: Verify Deployment

### Backend Health Check

```bash
curl https://your-api-service.onrender.com/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2024-...",
  "version": "1.0.0"
}
```

### Frontend Check

Visit your frontend URL and verify:

- Page loads correctly
- API calls work (check browser console)
- Google OAuth redirects work

### Test API Endpoint

```bash
curl https://your-api-service.onrender.com/api
```

## Step 5: Update Google OAuth Configuration

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Edit your OAuth 2.0 Client ID
3. Update **Authorized redirect URIs**:
   - Add: `https://your-api-service.onrender.com/api/oauth/gmail/callback`
4. Save changes

## Environment Variables Reference

### Backend Service Required Variables

| Variable               | Description                      | Example                                                       |
| ---------------------- | -------------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`             | Environment mode                 | `production`                                                  |
| `PORT`                 | Server port (auto-set by Render) | `10000`                                                       |
| `DB_HOST`              | PostgreSQL host                  | `postgres.onrender.com`                                       |
| `DB_PORT`              | PostgreSQL port                  | `5432`                                                        |
| `DB_NAME`              | Database name                    | `numenor_security`                                            |
| `DB_USER`              | Database user                    | `numenor_user`                                                |
| `DB_PASSWORD`          | Database password                | `secure-password`                                             |
| `DB_SSL`               | Use SSL connection               | `true`                                                        |
| `JWT_SECRET`           | JWT signing secret               | `min-32-chars`                                                |
| `TOKEN_SECRET`         | Token encryption secret          | `min-32-chars`                                                |
| `CORS_ORIGINS`         | Allowed CORS origins             | `https://numenorsecurity.com,https://www.numenorsecurity.com` |
| `FRONTEND_URL`         | Frontend URL for redirects       | `https://www.numenorsecurity.com`                             |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID           | `xxx.apps.googleusercontent.com`                              |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret              | `xxx`                                                         |
| `GOOGLE_REDIRECT_URI`  | OAuth callback URL               | `https://api.onrender.com/api/oauth/gmail/callback`           |

### Frontend Service Required Variables

| Variable                | Description            | Example                          |
| ----------------------- | ---------------------- | -------------------------------- |
| `VITE_API_URL`          | Backend API URL        | `https://api.onrender.com/api`   |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID | `xxx.apps.googleusercontent.com` |

**Note**: Variables prefixed with `VITE_` are baked into the frontend bundle at build time.

## Troubleshooting

### Backend Issues

**404 on API endpoints:**

- Verify routes are registered in `app/api/server.ts`
- Check that `/api` prefix is correct
- Verify CORS configuration

**Database connection errors:**

- Check `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- Verify `DB_SSL=true` for Render PostgreSQL
- Check database is accessible from Render

**CORS errors:**

- Verify `CORS_ORIGINS` includes your frontend domain
- Check both `www` and non-`www` versions if using both
- Ensure `credentials: true` is set (already configured)

### Frontend Issues

**API calls failing:**

- Verify `VITE_API_URL` is set correctly
- Check browser console for CORS errors
- Ensure backend is running and accessible

**Build failures:**

- Check that all required `VITE_*` variables are set
- Verify Dockerfile build process
- Check Render build logs

**Google OAuth not working:**

- Verify `VITE_GOOGLE_CLIENT_ID` matches backend `GOOGLE_CLIENT_ID`
- Check redirect URI in Google Console matches backend URL
- Ensure OAuth callback URL is accessible

## Security Checklist

- [ ] All secrets are in Render environment variables (not in code)
- [ ] `JWT_SECRET` and `TOKEN_SECRET` are strong (32+ characters)
- [ ] Database password is strong and unique
- [ ] `DB_SSL=true` for production database
- [ ] CORS origins are restricted to your domains only
- [ ] Google OAuth redirect URIs are restricted
- [ ] HTTPS is enforced (automatic on Render)
- [ ] Environment variables are not exposed in frontend bundle (except `VITE_*`)

## Cost Optimization

- **Free Tier**: Both services can run on Render's free tier
- **Database**: Render PostgreSQL free tier includes 90 days retention
- **Scaling**: Upgrade to paid plans for better performance and uptime

## Monitoring

- **Logs**: View logs in Render Dashboard → Logs
- **Metrics**: Monitor CPU, memory, and response times
- **Alerts**: Set up alerts for service downtime

## Support

For issues specific to:

- **Render**: Check Render documentation or support
- **Application**: Check application logs and error messages
- **Database**: Verify connection strings and SSL settings
