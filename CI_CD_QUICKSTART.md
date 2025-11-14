# CI/CD Quick Start Guide

Get your CI/CD pipeline running in 5 minutes.

## Prerequisites Checklist

- [ ] GitHub repository connected
- [ ] GitHub Actions enabled (default)
- [ ] Docker images will be pushed to GHCR (public or private)

## Step 1: Set GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

Add:
- **Name**: `VITE_GOOGLE_CLIENT_ID`
- **Value**: Your Google OAuth client ID (for frontend builds)

**Note**: `GITHUB_TOKEN` is automatically provided by GitHub Actions (no action needed).

## Step 2: Verify Workflows

The workflows are already in place:
- `.github/workflows/ci.yml` - Runs on PRs and pushes
- `.github/workflows/cd.yml` - Runs on pushes to `main`

## Step 3: Test CI

1. Create a test branch:
   ```bash
   git checkout -b test-ci
   ```

2. Make a small change and push:
   ```bash
   git add .
   git commit -m "test: CI workflow"
   git push origin test-ci
   ```

3. Create a PR to `main` branch

4. Check GitHub Actions tab → You should see CI workflow running

## Step 4: Test CD (after merging to main)

1. Merge your PR to `main`

2. Check GitHub Actions tab → CD workflow should run

3. After completion, check:
   - GitHub Container Registry: `https://github.com/YOUR_USERNAME?tab=packages`
   - You should see 3 images:
     - `numenor-api`
     - `numenor-frontend`
     - `numenor-migrate`

## Step 5: Deploy to Render/Railway

Follow the detailed guide in `DEPLOYMENT.md`:

- **Render**: Use Docker images from GHCR
- **Railway**: Use Docker images from GHCR

Both platforms support auto-deploy when images are updated.

## Troubleshooting

### CI fails on typecheck
- Fix TypeScript errors
- Run `npm run typecheck` locally first

### CI fails on tests
- Fix failing tests
- Run `npm test` locally first

### CD fails on image push
- Check GHCR permissions
- Ensure `GITHUB_TOKEN` has `packages:write` permission (automatic)

### Images not found in GHCR
- Wait a few minutes after CD completes
- Check repository visibility (public vs private)
- Verify image names match your GitHub username/org

## Quick Commands

```bash
# Test locally
npm run typecheck
npm test

# Build Docker images locally
docker build -f Dockerfile.api -t numenor-api:local .
docker build -f Dockerfile -t numenor-frontend:local .
docker build -f Dockerfile.migrate -t numenor-migrate:local .

# Run migrations locally
docker run --rm \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_NAME=numenor_security \
  -e DB_USER=numenor_user \
  -e DB_PASSWORD=numenor_password \
  numenor-migrate:local
```

## What Happens When You Push?

```
Push to main
    ↓
CI runs (tests, lint, Docker builds)
    ↓
CD runs (builds & pushes to GHCR)
    ↓
Render/Railway auto-deploys (if configured)
    ↓
Migration runs (via deploy hook)
    ↓
✅ Live!
```

## Next Steps

1. ✅ Set up GitHub Secrets
2. ✅ Test CI with a PR
3. ✅ Merge to main and verify CD
4. ✅ Configure Render/Railway deployment
5. ✅ Set up migration hooks
6. ✅ Monitor deployments

For detailed deployment instructions, see `DEPLOYMENT.md`.

