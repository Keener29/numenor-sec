# Deployment Guide - Numenor Security

This guide covers deploying Numenor Security to Render or Railway using Docker images from GitHub Container Registry (GHCR).

## Prerequisites

1. **GitHub Secrets** (set in repository settings):
   - `VITE_GOOGLE_CLIENT_ID` - Google OAuth client ID for frontend builds
   - `GITHUB_TOKEN` - Automatically provided by GitHub Actions (no action needed)

2. **GHCR Access**:
   - Images are public by default, or set repository to private and configure access
   - For private repos: Create a Personal Access Token (PAT) with `read:packages` scope

3. **Environment Variables** (see `ENV_VARS.md` for complete list)

---

## Deployment Platforms

### Option 1: Render

#### Setup Steps

1. **Create Web Services**:
   - Go to Render Dashboard → New → Web Service
   - Connect your GitHub repository
   - Enable "Auto-Deploy" on push to `main`

2. **API Service**:
   - **Name**: `numenor-api`
   - **Environment**: Docker
   - **Docker Image**: `ghcr.io/YOUR_USERNAME/numenor-api:latest`
   - **Port**: `3000`
   - **Health Check Path**: `/health`
   - **Start Command**: (leave empty, uses Dockerfile CMD)

   **Environment Variables**:
   ```
   NODE_ENV=production
   API_PORT=3000
   DB_HOST=<render-postgres-host>
   DB_PORT=5432
   DB_NAME=numenor_security
   DB_USER=<render-postgres-user>
   DB_PASSWORD=<render-postgres-password>
   JWT_SECRET=<generate-strong-secret>
   TOKEN_SECRET=<generate-strong-secret>
   GOOGLE_CLIENT_ID=<your-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-client-secret>
   GOOGLE_REDIRECT_URI=https://your-api-domain.onrender.com/api/oauth/gmail/callback
   FRONTEND_URL=https://your-frontend-domain.onrender.com
   SMTP_HOST=<your-smtp-host>
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<your-smtp-user>
   SMTP_PASS=<your-smtp-password>
   SMTP_FROM=<your-email>
   WHOIS_JSON_API_KEY=<optional>
   WHOIS_XML_API_KEY=<optional>
   ```

3. **Frontend Service**:
   - **Name**: `numenor-frontend`
   - **Environment**: Docker
   - **Docker Image**: `ghcr.io/YOUR_USERNAME/numenor-frontend:latest`
   - **Port**: `3000`
   - **Health Check Path**: `/`

   **Environment Variables**:
   ```
   NODE_ENV=production
   API_URL=https://your-api-domain.onrender.com
   VITE_GOOGLE_CLIENT_ID=<your-google-client-id>
   ```

4. **PostgreSQL Database**:
   - Go to Render Dashboard → New → PostgreSQL
   - **Name**: `numenor-postgres`
   - **Database**: `numenor_security`
   - Note the connection details for API service

5. **Redis** (Optional):
   - Go to Render Dashboard → New → Redis
   - **Name**: `numenor-redis`
   - Note the connection URL for API service

6. **Run Migrations** (after first deployment):
   - Go to Render Dashboard → Shell
   - Run:
     ```bash
     docker run --rm \
       -e DB_HOST=<postgres-host> \
       -e DB_PORT=5432 \
       -e DB_NAME=numenor_security \
       -e DB_USER=<postgres-user> \
       -e DB_PASSWORD=<postgres-password> \
       ghcr.io/YOUR_USERNAME/numenor-migrate:latest
     ```

   **OR** use Render's Deploy Hook:
   - Create a Background Worker service:
     - **Name**: `numenor-migrate`
     - **Docker Image**: `ghcr.io/YOUR_USERNAME/numenor-migrate:latest`
     - **Environment Variables**: Same DB vars as API
     - **Run Command**: (leave empty, uses Dockerfile CMD)
   - Set this worker to run on deploy via webhook or manually trigger

#### Auto-Deploy Setup

Render automatically deploys when:
- You push to `main` branch
- GitHub Actions CD workflow completes successfully
- Images are pushed to GHCR

**Deploy Hook** (for migrations):
1. In API service settings, add a "Deploy Hook"
2. Create a Background Worker that triggers on this hook
3. Worker runs migration container

---

### Option 2: Railway

#### Setup Steps

1. **Create New Project**:
   - Go to Railway Dashboard → New Project
   - Select "Deploy from GitHub repo"
   - Choose your repository

2. **API Service**:
   - Add new service → Docker Image
   - **Image**: `ghcr.io/YOUR_USERNAME/numenor-api:latest`
   - **Port**: `3000`
   - **Health Check**: `/health`

   **Environment Variables** (add in Railway dashboard):
   ```
   NODE_ENV=production
   API_PORT=3000
   DB_HOST=${{Postgres.PGHOST}}
   DB_PORT=${{Postgres.PGPORT}}
   DB_NAME=${{Postgres.PGDATABASE}}
   DB_USER=${{Postgres.PGUSER}}
   DB_PASSWORD=${{Postgres.PGPASSWORD}}
   JWT_SECRET=<generate-strong-secret>
   TOKEN_SECRET=<generate-strong-secret>
   GOOGLE_CLIENT_ID=<your-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-client-secret>
   GOOGLE_REDIRECT_URI=https://your-api-domain.up.railway.app/api/oauth/gmail/callback
   FRONTEND_URL=https://your-frontend-domain.up.railway.app
   SMTP_HOST=<your-smtp-host>
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<your-smtp-user>
   SMTP_PASS=<your-smtp-password>
   SMTP_FROM=<your-email>
   WHOIS_JSON_API_KEY=<optional>
   WHOIS_XML_API_KEY=<optional>
   ```

3. **Frontend Service**:
   - Add new service → Docker Image
   - **Image**: `ghcr.io/YOUR_USERNAME/numenor-frontend:latest`
   - **Port**: `3000`

   **Environment Variables**:
   ```
   NODE_ENV=production
   API_URL=https://your-api-domain.up.railway.app
   VITE_GOOGLE_CLIENT_ID=<your-google-client-id>
   ```

4. **PostgreSQL Database**:
   - Add new service → PostgreSQL
   - Railway automatically creates and injects connection vars
   - Use Railway's variable references (e.g., `${{Postgres.PGHOST}}`)

5. **Redis** (Optional):
   - Add new service → Redis
   - Use Railway's variable references

6. **Run Migrations**:
   Railway supports post-deploy scripts. Create `railway.toml`:

   ```toml
   [build]
   builder = "DOCKERFILE"
   dockerfilePath = "Dockerfile.migrate"

   [deploy]
   startCommand = "npm run db:migrate"
   healthcheckPath = "/"
   healthcheckTimeout = 100
   restartPolicyType = "ON_FAILURE"
   restartPolicyMaxRetries = 10
   ```

   **OR** create a separate migration service:
   - Add new service → Docker Image
   - **Image**: `ghcr.io/YOUR_USERNAME/numenor-migrate:latest`
   - **Environment Variables**: Same DB vars as API
   - **Deploy Type**: "One-off" or trigger manually

#### Auto-Deploy Setup

Railway automatically deploys when:
- You push to `main` branch (if connected to GitHub)
- GitHub Actions CD workflow completes
- Images are updated in GHCR

**Post-Deploy Hook**:
1. In Railway project settings, add a webhook
2. Configure it to trigger after API service deploys
3. Webhook runs migration container

**Manual Migration**:
```bash
railway run --service numenor-migrate npm run db:migrate
```

---

## Migration Container

The `numenor-migrate` container runs database migrations. It uses the same base as the API but executes `npm run db:migrate`.

### Building Migration Image

The migration image is built from `Dockerfile.migrate`. To build and push manually:

```bash
docker build -f Dockerfile.migrate -t ghcr.io/YOUR_USERNAME/numenor-migrate:latest .
docker push ghcr.io/YOUR_USERNAME/numenor-migrate:latest
```

### Running Migrations Locally

```bash
docker run --rm \
  --network numenor-network \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=numenor_security \
  -e DB_USER=numenor_user \
  -e DB_PASSWORD=numenor_password \
  ghcr.io/YOUR_USERNAME/numenor-migrate:latest
```

---

## Image Tags

Images are tagged with:
- `latest` - Latest successful build from `main` branch
- `main-<SHA>` - Specific commit SHA (e.g., `main-abc1234`)
- `v1.0.0` - Semantic version tags (if you tag releases)

Use `latest` for auto-deploy, or pin to a specific SHA for production stability.

---

## Troubleshooting

### Images Not Found
- Ensure GHCR repository is public, or configure authentication
- Check image names match your GitHub username/org

### Migrations Fail
- Verify database connection variables
- Check database is accessible from migration container
- Review migration logs in container output

### Health Checks Fail
- Ensure `/health` endpoint exists in API
- Check port mappings match service configuration
- Verify services are listening on correct ports

### Build Failures
- Check GitHub Actions logs for CI/CD errors
- Verify all secrets are set in repository settings
- Ensure Dockerfiles build successfully locally

---

## Security Notes

1. **Never commit secrets** - Use platform environment variables
2. **Rotate secrets regularly** - Especially JWT_SECRET and TOKEN_SECRET
3. **Use private GHCR** - For production, make images private and configure access
4. **Enable HTTPS** - Both Render and Railway provide HTTPS by default
5. **Database access** - Restrict database access to only necessary services

---

## Quick Reference

### Render
- **Dashboard**: https://dashboard.render.com
- **Docs**: https://render.com/docs
- **Deploy Hooks**: https://render.com/docs/deploy-hooks

### Railway
- **Dashboard**: https://railway.app
- **Docs**: https://docs.railway.app
- **CLI**: `npm i -g @railway/cli`

### GitHub Container Registry
- **Images**: `ghcr.io/YOUR_USERNAME/numenor-*`
- **Docs**: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry

