# Deployment Refactoring Summary

This document summarizes the changes made to refactor the project for separate Render services deployment.

## Changes Made

### 1. Backend API Service (`Dockerfile.api`)

**Updated:**

- ✅ Now supports Render's `PORT` environment variable (auto-set by Render)
- ✅ Health check uses dynamic PORT
- ✅ Standalone deployment ready

**Key Points:**

- Uses `tsx` to run TypeScript directly (no build step needed)
- Exposes port 3001 (or PORT env var)
- All dependencies included for runtime

### 2. Frontend Service (`Dockerfile`)

**Updated:**

- ✅ Optimized to only copy frontend files (excludes API backend)
- ✅ Build arguments for `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID`
- ✅ Supports Render's `PORT` environment variable
- ✅ Multi-stage build for smaller production image

**Key Points:**

- Build-time environment variables (`VITE_*`) are baked into the bundle
- Only production dependencies in final image
- React Router serves the built application

### 3. CORS Configuration (`app/api/server.ts`)

**Updated:**

- ✅ Supports `CORS_ORIGINS` environment variable (comma-separated)
- ✅ Default includes both `www` and non-`www` domains
- ✅ Flexible configuration for multiple frontend domains

**Before:**

```typescript
origin: process.env.NODE_ENV === "production"
  ? ["https://numenorsecurity.com"]
  : ["http://localhost:3000"];
```

**After:**

```typescript
const getAllowedOrigins = (): string[] => {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim());
  }
  return process.env.NODE_ENV === "production"
    ? ["https://numenorsecurity.com", "https://www.numenorsecurity.com"]
    : ["http://localhost:3000"];
};
```

### 4. PORT Configuration (`app/api/server.ts`)

**Updated:**

- ✅ Now checks `process.env.PORT` first (Render's standard)
- ✅ Falls back to `API_PORT` or `3001`

**Before:**

```typescript
const PORT = process.env.API_PORT || 3001;
```

**After:**

```typescript
const PORT = process.env.PORT || process.env.API_PORT || 3001;
```

## New Files Created

### 1. `RENDER_DEPLOYMENT.md`

Complete deployment guide with:

- Step-by-step instructions
- Environment variable reference
- Troubleshooting guide
- Security checklist

### 2. `render.yaml`

Blueprint configuration for Render:

- Defines both services
- Environment variable templates
- Health check paths
- Deployment settings

### 3. `DEPLOYMENT_SUMMARY.md` (this file)

Summary of all changes

## Environment Variables Required

### Backend Service

- `NODE_ENV=production`
- `PORT` (auto-set by Render)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`
- `JWT_SECRET`, `TOKEN_SECRET`
- `CORS_ORIGINS` (comma-separated: `https://domain.com,https://www.domain.com`)
- `FRONTEND_URL` (for OAuth redirects)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- SMTP configuration variables
- WHOIS API keys (optional)

### Frontend Service

- `VITE_API_URL` (build-time: `https://your-api-service.onrender.com/api`)
- `VITE_GOOGLE_CLIENT_ID` (build-time: same as backend)
- `NODE_ENV=production` (optional, for reference)

## Deployment Steps

1. **Deploy Backend First**
   - Use `Dockerfile.api`
   - Set all environment variables
   - Note the assigned URL

2. **Update Google OAuth**
   - Add backend URL to authorized redirect URIs
   - Update `GOOGLE_REDIRECT_URI` env var

3. **Deploy Frontend**
   - Use `Dockerfile`
   - Set `VITE_API_URL` to backend URL
   - Set `VITE_GOOGLE_CLIENT_ID`
   - Configure custom domain (optional)

4. **Update Backend CORS**
   - Set `CORS_ORIGINS` to include frontend domain(s)
   - Set `FRONTEND_URL` to frontend URL

5. **Run Database Migrations**
   - Use Render Shell or one-time job
   - Run: `npm run db:migrate`

## Testing Checklist

- [ ] Backend health check: `/health`
- [ ] Backend API docs: `/api`
- [ ] Frontend loads correctly
- [ ] API calls work from frontend
- [ ] Google OAuth login works
- [ ] CORS headers are correct
- [ ] Cookies are set correctly (httpOnly, secure, sameSite)
- [ ] Database connections work
- [ ] Email sending works (if configured)

## Breaking Changes

**None** - All changes are backward compatible:

- Local development still works with `docker-compose.yml`
- Environment variables have sensible defaults
- CORS defaults include common domains

## Migration Notes

If migrating from single-service deployment:

1. **Update CORS**: Add `CORS_ORIGINS` env var with your frontend domain
2. **Update OAuth**: Update `GOOGLE_REDIRECT_URI` to backend URL
3. **Rebuild Frontend**: Ensure `VITE_API_URL` is set correctly
4. **Test Thoroughly**: Verify all API calls work

## Support

For deployment issues:

1. Check `RENDER_DEPLOYMENT.md` troubleshooting section
2. Review Render logs in Dashboard
3. Verify environment variables are set correctly
4. Check CORS configuration matches your domains
