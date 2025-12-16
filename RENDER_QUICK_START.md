# Render Quick Start Guide

## TL;DR - Deploy in 5 Steps

### 1. Deploy Backend API

- **Service Type**: Web Service
- **Dockerfile**: `Dockerfile.api`
- **Required Env Vars**: See `RENDER_DEPLOYMENT.md` section 1.1
- **Health Check**: `/health`
- **Note the URL**: `https://your-api.onrender.com`

### 2. Update Google OAuth

- Add backend callback URL to Google Console:
  - `https://your-api.onrender.com/api/oauth/gmail/callback`

### 3. Deploy Frontend

- **Service Type**: Web Service
- **Dockerfile**: `Dockerfile`
- **Required Env Vars**:
  - `VITE_API_URL=https://your-api.onrender.com/api` ⚠️ **Must match backend URL**
  - `VITE_GOOGLE_CLIENT_ID=your-client-id` ⚠️ **Must match backend**

### 4. Update Backend CORS

- Set `CORS_ORIGINS` in backend service:
  - `https://your-frontend.onrender.com,https://www.yourdomain.com`
- Set `FRONTEND_URL`:
  - `https://www.yourdomain.com`

### 5. Run Migrations

- Use Render Shell or one-time job:
  - `npm run db:migrate`

## Common Issues

### ❌ 404 on `/api/auth/google`

**Cause**: Frontend hitting wrong URL or backend not running  
**Fix**:

- Verify `VITE_API_URL` includes `/api` suffix
- Check backend is deployed and healthy
- Verify CORS allows your frontend domain

### ❌ CORS Error

**Cause**: Frontend domain not in CORS_ORIGINS  
**Fix**: Add frontend URL to `CORS_ORIGINS` (comma-separated)

### ❌ Google OAuth Fails

**Cause**: Redirect URI mismatch  
**Fix**:

- Update Google Console redirect URI
- Update `GOOGLE_REDIRECT_URI` env var
- Must match exactly (including `/api/oauth/gmail/callback`)

### ❌ Frontend Shows Wrong API URL

**Cause**: `VITE_API_URL` changed but frontend not rebuilt  
**Fix**:

- Update `VITE_API_URL` env var
- Trigger manual rebuild in Render Dashboard

## Environment Variables Cheat Sheet

### Backend (Required)

```
NODE_ENV=production
DB_HOST=...
DB_PASSWORD=...
JWT_SECRET=...
TOKEN_SECRET=...
CORS_ORIGINS=https://frontend.onrender.com,https://www.domain.com
FRONTEND_URL=https://www.domain.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.onrender.com/api/oauth/gmail/callback
```

### Frontend (Required)

```
VITE_API_URL=https://api.onrender.com/api
VITE_GOOGLE_CLIENT_ID=...
```

## Deployment Order Matters!

1. ✅ Backend first (needed for frontend `VITE_API_URL`)
2. ✅ Frontend second (needs backend URL)
3. ✅ Update CORS after both deployed
4. ✅ Update OAuth redirect URIs

## Testing Checklist

```bash
# Backend health
curl https://api.onrender.com/health

# Backend API docs
curl https://api.onrender.com/api

# Frontend loads
curl https://frontend.onrender.com

# Test from browser:
# - Login works
# - API calls succeed (check Network tab)
# - Google OAuth redirects correctly
```

## Need More Help?

See `RENDER_DEPLOYMENT.md` for detailed instructions.
