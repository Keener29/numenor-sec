# CI/CD Setup Summary - Numenor Security

Complete CI/CD pipeline for Dockerized anti-phishing SaaS.

## 📁 Files Created

### GitHub Actions Workflows
- `.github/workflows/ci.yml` - Continuous Integration (tests, lint, Docker builds)
- `.github/workflows/cd.yml` - Continuous Deployment (build & push to GHCR)

### Dockerfiles
- `Dockerfile.migrate` - Migration container (runs database migrations)

### Documentation
- `DEPLOYMENT.md` - Complete deployment guide for Render & Railway
- `ENV_VARS.md` - Environment variables reference
- `CI_CD_DIAGRAM.md` - Visual flow diagrams
- `CI_CD_QUICKSTART.md` - 5-minute setup guide

## 🚀 Quick Start

1. **Set GitHub Secret**:
   - Repository → Settings → Secrets → Actions
   - Add `VITE_GOOGLE_CLIENT_ID`

2. **Push to main**:
   ```bash
   git add .
   git commit -m "feat: add CI/CD pipeline"
   git push origin main
   ```

3. **Watch it work**:
   - CI runs automatically on push
   - CD runs automatically on merge to main
   - Images pushed to GHCR

4. **Deploy**:
   - Follow `DEPLOYMENT.md` for Render/Railway setup

## 📦 Docker Images

Three images are built and pushed to GHCR:

1. **numenor-api** - Backend API server
2. **numenor-frontend** - React frontend
3. **numenor-migrate** - Database migrations (one-time runner)

Image tags:
- `latest` - Latest successful build
- `main-<SHA>` - Specific commit SHA
- `v1.0.0` - Semantic version tags

## 🔄 Workflow Flow

```
Developer Push
    ↓
CI Workflow (PR or main)
    ├─ Install deps
    ├─ Run typecheck
    ├─ Run tests
    ├─ Security audit
    └─ Build Docker images (verify)
    ↓
CD Workflow (main only)
    ├─ Build images
    ├─ Push to GHCR
    └─ Tag with latest + SHA
    ↓
Render/Railway Auto-Deploy
    ├─ Pull images
    ├─ Deploy services
    └─ Run migrations
    ↓
✅ Live!
```

## ⚙️ Configuration

### Required GitHub Secrets
- `VITE_GOOGLE_CLIENT_ID` - Google OAuth client ID (for frontend builds)

### Auto-Provided
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

### Platform Environment Variables
See `ENV_VARS.md` for complete list of required environment variables for:
- API service
- Frontend service
- Migration service
- Database (PostgreSQL)
- Redis (optional)

## 🎯 Features

✅ **CI Pipeline**:
- Runs on PRs and pushes to main
- TypeScript type checking
- Jest test suite
- npm security audit
- Docker image build verification
- Cached dependencies for speed

✅ **CD Pipeline**:
- Runs only on main branch merges
- Builds production Docker images
- Pushes to GitHub Container Registry
- Tags with latest and Git SHA
- Outputs deployment information

✅ **Migration Support**:
- Dedicated migration container
- Instructions for Render deploy hooks
- Instructions for Railway post-deploy scripts
- One-time execution per deployment

## 📊 Performance

- **CI**: ~2-3 minutes
- **CD**: ~5-8 minutes
- **Total**: ~10-15 minutes from push to live

## 🔒 Security

- Non-root Docker containers
- Secrets stored in GitHub Secrets
- Security audit in CI
- Environment variable validation
- HTTPS enforced in production

## 📚 Documentation

- **Quick Start**: `CI_CD_QUICKSTART.md`
- **Deployment**: `DEPLOYMENT.md`
- **Environment Variables**: `ENV_VARS.md`
- **Diagrams**: `CI_CD_DIAGRAM.md`

## 🐛 Troubleshooting

### CI fails
- Check GitHub Actions logs
- Run `npm run typecheck` and `npm test` locally
- Fix TypeScript/test errors

### CD fails
- Verify GHCR permissions
- Check image names match GitHub username
- Review build logs

### Deployment fails
- Verify environment variables
- Check database connectivity
- Review migration logs

## 🎓 Next Steps

1. ✅ CI/CD pipeline configured
2. ⏭️ Set up Render/Railway services
3. ⏭️ Configure environment variables
4. ⏭️ Set up migration hooks
5. ⏭️ Monitor deployments
6. ⏭️ Set up alerts/notifications

## 📝 Notes

- Images are public by default in GHCR
- For private images, configure repository access
- Migration container runs once per deployment
- All containers use non-root users
- Health checks configured for all services

---

**Ready to deploy!** Follow `DEPLOYMENT.md` for platform-specific instructions.

