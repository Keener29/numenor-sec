# CI/CD Flow Diagram - Numenor Security

## Build & Deploy Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Developer                                │
│                    (git push / PR)                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Repository                            │
│                  (main branch / PR)                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  GitHub       │
                    │  Actions      │
                    └───────┬───────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌───────────────┐                      ┌───────────────┐
│   CI Workflow │                      │   CD Workflow │
│  (PR & Push)  │                      │  (Main Only)  │
└───────┬───────┘                      └───────┬───────┘
        │                                       │
        ├─ Checkout Code                       │
        ├─ Setup Node.js                       │
        ├─ Install Dependencies                │
        ├─ Run Typecheck                       │
        ├─ Run Tests                           │
        ├─ Security Audit                      │
        ├─ Build Docker Images                 │
        │  ├─ numenor-api                      │
        │  └─ numenor-frontend                 │
        └─ Verify Images                       │
                                               │
                                               ├─ Checkout Code
                                               ├─ Setup Docker Buildx
                                               ├─ Login to GHCR
                                               ├─ Build & Push Images
                                               │  ├─ numenor-api:latest
                                               │  ├─ numenor-api:main-<SHA>
                                               │  ├─ numenor-frontend:latest
                                               │  └─ numenor-frontend:main-<SHA>
                                               └─ Output Deployment Info
                                                       │
                                                       ▼
                                    ┌──────────────────────────────┐
                                    │   GitHub Container Registry  │
                                    │      (ghcr.io)               │
                                    │                              │
                                    │  • numenor-api:latest        │
                                    │  • numenor-api:main-<SHA>    │
                                    │  • numenor-frontend:latest   │
                                    │  • numenor-frontend:main-<SHA>│
                                    └──────────────┬───────────────┘
                                                   │
                        ┌─────────────────────────┴─────────────────────────┐
                        │                                                     │
                        ▼                                                     ▼
            ┌──────────────────────┐                          ┌──────────────────────┐
            │      Render           │                          │      Railway          │
            │   (Auto-Deploy)       │                          │   (Auto-Deploy)       │
            └───────────┬───────────┘                          └───────────┬───────────┘
                        │                                                 │
                        ├─ Pull Images from GHCR                          │
                        ├─ Deploy Services                                 │
                        │  ├─ numenor-api                                 │
                        │  ├─ numenor-frontend                             │
                        │  └─ numenor-postgres                             │
                        └─ Run Migrations                                  │
                           (via Deploy Hook)                               │
                                                                           │
                                                                           ├─ Pull Images from GHCR
                                                                           ├─ Deploy Services
                                                                           │  ├─ numenor-api
                                                                           │  ├─ numenor-frontend
                                                                           │  └─ numenor-postgres
                                                                           └─ Run Migrations
                                                                              (via Post-Deploy Hook)
```

## Container Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Production                              │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │──────│     API      │──────│  PostgreSQL  │
│   (Port 3000)│      │   (Port 3000)│      │   (Port 5432)│
└──────────────┘      └──────┬───────┘      └──────────────┘
                             │
                             │
                    ┌────────┴────────┐
                    │                 │
            ┌───────▼──────┐  ┌───────▼──────┐
            │    Redis     │  │   Migrate    │
            │  (Optional)  │  │  (One-time)  │
            └──────────────┘  └──────────────┘
```

## Workflow Triggers

### CI Workflow (`.github/workflows/ci.yml`)
- **Trigger**: `pull_request` to `main` OR `push` to `main`
- **Purpose**: Validate code quality, run tests, verify Docker builds
- **Duration**: ~2-3 minutes
- **Artifacts**: None (builds but doesn't push)

### CD Workflow (`.github/workflows/cd.yml`)
- **Trigger**: `push` to `main` branch only
- **Purpose**: Build production images and push to GHCR
- **Duration**: ~5-8 minutes
- **Artifacts**: Docker images in GHCR

## Image Tagging Strategy

```
main branch push (SHA: abc1234)
    │
    ├─→ numenor-api:latest
    ├─→ numenor-api:main-abc1234
    ├─→ numenor-frontend:latest
    └─→ numenor-frontend:main-abc1234

Tagged release (v1.0.0)
    │
    ├─→ numenor-api:v1.0.0
    ├─→ numenor-api:v1.0
    ├─→ numenor-api:v1
    ├─→ numenor-frontend:v1.0.0
    ├─→ numenor-frontend:v1.0
    └─→ numenor-frontend:v1
```

## Migration Flow

```
Deployment Trigger
    │
    ├─→ API Service Deployed
    │       │
    │       └─→ Deploy Hook / Post-Deploy Script
    │               │
    │               └─→ Run Migration Container
    │                       │
    │                       ├─→ Connect to PostgreSQL
    │                       ├─→ Execute schema.sql
    │                       └─→ Exit (one-time job)
    │
    └─→ Frontend Service Deployed
            │
            └─→ Ready to serve traffic
```

## Cache Strategy

```
GitHub Actions Cache (Buildx)
    │
    ├─→ Docker Layer Cache (GHCR)
    │   └─→ Speeds up subsequent builds
    │
    └─→ npm Cache (Node.js action)
        └─→ Speeds up dependency installation
```

## Failure Points & Recovery

1. **CI Fails** → Fix code, push again
2. **CD Fails** → Check GHCR permissions, retry workflow
3. **Migration Fails** → Check DB connection, run manually
4. **Deploy Fails** → Check image tags, verify env vars

## Time Estimates

- **CI**: 2-3 minutes (test + build verification)
- **CD**: 5-8 minutes (build + push images)
- **Deploy**: 2-5 minutes (Render/Railway pull + start)
- **Migration**: 10-30 seconds (one-time per deploy)

**Total**: ~10-15 minutes from push to live

