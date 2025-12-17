# Security Audit Report - MVP Level Requirements

**Date:** 2025
**Auditor:** Senior Security Engineer  
**Scope:** Full codebase security audit for MVP-level requirements

---

## Executive Summary

This audit covers four critical security areas:

1. **TLS Everywhere** - HTTPS enforcement
2. **Secrets Management** - No hardcoded secrets
3. **Rate Limiting & Input Validation** - Protection against abuse
4. **Database Access** - Least privilege principles

**Overall Status:** ⚠️ **NEEDS IMPROVEMENT** - Several critical and high-severity issues identified.

---

## 1. TLS Everywhere

### ❌ CRITICAL: HTTPS Not Enforced

**Issue:** The application accepts HTTP connections and does not enforce HTTPS/TLS termination.

**Findings:**

1. **nginx.conf - HTTP Only (Lines 14-61)**
   - Server listens on port 80 (HTTP) only
   - HTTPS configuration is commented out (lines 63-77)
   - No HTTP to HTTPS redirect configured
   - Missing HSTS (HTTP Strict Transport Security) headers

2. **Server Logs Expose HTTP URLs (app/api/server.ts:133-134)**

   ```typescript
   apiDocs: `http://localhost:${PORT}/api`,
   healthCheck: `http://localhost:${PORT}/health`
   ```

   - Hardcoded HTTP URLs in production logs

3. **Default URLs Use HTTP (Multiple Files)**
   - `app/api/services/oauth/gmail/GmailOAuthService.ts:42` - Default redirect URI uses HTTP
   - `app/api/routes/auth.ts:237` - Password reset links default to HTTP
   - `app/api/routes/oauth/gmail.ts:116,120,127,145,155` - OAuth callbacks use HTTP fallbacks

4. **No HTTPS Redirect Middleware**
   - Express app does not redirect HTTP to HTTPS
   - No trust proxy configuration for reverse proxy setups

**Severity:** 🔴 **CRITICAL**

**Fix Required:**

```typescript
// app/api/server.ts - Add HTTPS enforcement middleware
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.header("x-forwarded-proto") !== "https") {
      res.redirect(`https://${req.header("host")}${req.url}`);
    } else {
      next();
    }
  });

  // Trust proxy for correct X-Forwarded-* headers
  app.set("trust proxy", 1);
}

// Update Helmet configuration
app.use(
  helmet({
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);
```

```nginx
# nginx.conf - Uncomment and configure HTTPS
server {
    listen 80;
    server_name your-domain.com;

    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS header
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # ... rest of configuration
}
```

---

## 2. Secrets Management

### ⚠️ HIGH: Default Database Password in Code

**Issue:** Hardcoded default password in database configuration.

**File:** `app/db/config.ts:24`

```typescript
password: process.env.DB_PASSWORD || 'password',
```

**Severity:** 🟠 **HIGH**

**Fix Required:**

```typescript
// app/db/config.ts
export const getDatabaseConfig = (): DatabaseConfig => {
  const password = process.env.DB_PASSWORD;
  if (!password) {
    throw new Error("DB_PASSWORD environment variable is required");
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number.parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "numenor_security",
    user: process.env.DB_USER || "postgres",
    password, // No default fallback
    ssl: process.env.NODE_ENV === "production" ? true : false,
  };
};
```

### ⚠️ MEDIUM: Docker Compose Default Passwords

**Issue:** Default passwords in docker-compose.yml (development only, but still risky).

**File:** `docker-compose.yml:7-9`

```yaml
POSTGRES_DB: numenor_security
POSTGRES_USER: numenor_user
POSTGRES_PASSWORD: numenor_password
```

**Severity:** 🟡 **MEDIUM** (Development only, but should use env vars)

**Fix Required:**

```yaml
# docker-compose.yml
environment:
  POSTGRES_DB: ${DB_NAME:-numenor_security}
  POSTGRES_USER: ${DB_USER:-numenor_user}
  POSTGRES_PASSWORD: ${DB_PASSWORD:-} # Require env var
```

### ✅ GOOD: No Hardcoded Secrets Found

- No API keys, OAuth credentials, or JWT secrets hardcoded
- All secrets properly loaded from environment variables
- `.env` file is in `.gitignore` (line 5)

---

## 3. Rate Limiting & Input Validation

### ❌ CRITICAL: No Application-Level Rate Limiting

**Issue:** Rate limiting exists only in nginx.conf, not in Express application.

**Findings:**

1. **No express-rate-limit Middleware**
   - Package not installed (`package.json` - missing dependency)
   - No rate limiting middleware in `app/api/server.ts`
   - Comment in `app/api/routes/accounts.ts:17` acknowledges this gap

2. **nginx Rate Limiting Only**
   - Rate limiting configured in `nginx.conf:11-12`
   - Only protects if nginx is used (not guaranteed in all deployments)
   - No protection for direct Express server access

**Severity:** 🔴 **CRITICAL**

**Fix Required:**

```bash
# Install express-rate-limit
npm install express-rate-limit
```

```typescript
// app/api/middleware/rateLimit.ts (NEW FILE)
import rateLimit from "express-rate-limit";

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: "Too many authentication attempts, please try again later.",
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
});

// OAuth endpoint rate limiter
export const oauthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 OAuth attempts per hour
  message: "Too many OAuth authorization requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
```

```typescript
// app/api/server.ts - Add rate limiting
import { apiLimiter, authLimiter } from "./middleware/rateLimit.js";

// Apply general rate limiting to all API routes
app.use("/api", apiLimiter);

// Apply stricter rate limiting to auth routes
app.use("/api/auth", authLimiter);
```

```typescript
// app/api/routes/auth.ts - Apply rate limiting
import { authLimiter } from "../middleware/rateLimit.js";

router.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  async (req, res, next) => {
    // ... existing code
  }
);

router.post(
  "/register",
  authLimiter,
  validateBody(registerSchema),
  async (req, res, next) => {
    // ... existing code
  }
);

router.post("/forgot-password", authLimiter, async (req, res, next) => {
  // ... existing code
});
```

### ⚠️ HIGH: Missing Input Validation on Some Routes

**Issue:** Several routes lack proper input validation.

**Findings:**

1. **OAuth Routes Missing Validation**
   - `app/api/routes/oauth/gmail.ts:21` - `/auth-url` endpoint accepts query params without validation
   - `app/api/routes/oauth/gmail.ts:111` - `/callback` endpoint lacks input validation

2. **Auth Routes Missing Validation**
   - `app/api/routes/auth.ts:116` - `/google` endpoint lacks credential validation schema
   - `app/api/routes/auth.ts:214` - `/forgot-password` endpoint has manual validation instead of Zod schema

3. **Query Parameter Validation Missing**
   - `app/api/routes/phishing.ts:101` - `days` query param parsed without validation
   - `app/api/routes/phishing.ts:258` - `/patterns` endpoint lacks query validation

**Severity:** 🟠 **HIGH**

**Fix Required:**

```typescript
// app/api/schemas/oauth.ts (NEW FILE)
import { z } from "zod";

export const oauthAuthUrlSchema = z.object({
  emailAddress: z.string().email("Valid email address is required"),
  businessId: z.string().regex(/^\d+$/).transform(Number).optional(),
  approveToken: z.string().optional(),
});

export const oauthCallbackSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  state: z.string().min(1, "State parameter is required"),
  error: z.string().optional(),
});
```

```typescript
// app/api/routes/oauth/gmail.ts
import { validateQuery } from "../middleware/validation.js";
import { oauthAuthUrlSchema, oauthCallbackSchema } from "../schemas/oauth.js";

router.get(
  "/auth-url",
  validateQuery(oauthAuthUrlSchema),
  async (req, res, next) => {
    // ... existing code
  }
);

router.get(
  "/callback",
  validateQuery(oauthCallbackSchema),
  async (req, res, next) => {
    // ... existing code
  }
);
```

```typescript
// app/api/schemas/user.ts - Add missing schemas
export const googleAuthSchema = z.object({
  credential: z.string().min(1, "Google credential is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Valid email address is required"),
});
```

```typescript
// app/api/routes/auth.ts
import { googleAuthSchema, forgotPasswordSchema } from "../schemas/user.js";

router.post(
  "/google",
  validateBody(googleAuthSchema),
  async (req, res, next) => {
    // ... existing code
  }
);

router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  async (req, res, next) => {
    // ... existing code
  }
);
```

### ✅ GOOD: Most Routes Have Validation

- Zod schemas implemented for most endpoints
- Strong email validation in `app/api/schemas/email.ts`
- Parameterized queries prevent SQL injection
- Input sanitization in delete account schema

---

## 4. Database Access - Least Privilege

### ⚠️ HIGH: Using Default PostgreSQL Superuser

**Issue:** Database configuration defaults to `postgres` superuser.

**File:** `app/db/config.ts:23`

```typescript
user: process.env.DB_USER || 'postgres',
```

**Severity:** 🟠 **HIGH**

**Fix Required:**

1. **Create Dedicated Database User**

```sql
-- Create application user with limited privileges
CREATE USER numenor_app WITH PASSWORD 'strong_password_here';

-- Grant only necessary privileges
GRANT CONNECT ON DATABASE numenor_security TO numenor_app;
GRANT USAGE ON SCHEMA public TO numenor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO numenor_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO numenor_app;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO numenor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO numenor_app;
```

2. **Update Configuration**

```typescript
// app/db/config.ts
export const getDatabaseConfig = (): DatabaseConfig => {
  const user = process.env.DB_USER;
  if (!user) {
    throw new Error("DB_USER environment variable is required");
  }

  // Ensure we're not using postgres superuser in production
  if (process.env.NODE_ENV === "production" && user === "postgres") {
    throw new Error(
      "Cannot use postgres superuser in production. Use a dedicated application user."
    );
  }

  return {
    // ... rest of config
  };
};
```

### ⚠️ MEDIUM: No Read/Write Separation

**Issue:** Single database connection pool handles both read and write operations.

**File:** `app/db/connection.ts:18-43`

**Severity:** 🟡 **MEDIUM** (Acceptable for MVP, but should be documented)

**Recommendation:** For MVP, this is acceptable. For production scaling, consider:

- Separate read/write connection pools
- Read replicas for reporting queries

### ✅ GOOD: SQL Injection Protection

- All queries use parameterized queries (`$1, $2, etc.`)
- No string concatenation in SQL queries
- Proper use of `pg` library's query method

### ⚠️ MEDIUM: SSL Not Enforced in Development

**Issue:** SSL disabled in development mode.

**File:** `app/db/config.ts:25`

```typescript
ssl: process.env.NODE_ENV === 'production' ? true : false,
```

**Severity:** 🟡 **MEDIUM** (Development only, but should warn)

**Fix Required:**

```typescript
// app/db/config.ts
ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production',
```

---

## Summary Table

| Issue                      | Severity    | File                          | Line    | Fix Summary                                                    |
| -------------------------- | ----------- | ----------------------------- | ------- | -------------------------------------------------------------- |
| HTTPS not enforced         | 🔴 CRITICAL | nginx.conf                    | 14-61   | Uncomment HTTPS config, add HTTP→HTTPS redirect, enable HSTS   |
| HTTP URLs in logs          | 🔴 CRITICAL | app/api/server.ts             | 133-134 | Use environment variables for URLs, ensure HTTPS in production |
| No app-level rate limiting | 🔴 CRITICAL | app/api/server.ts             | -       | Install express-rate-limit, add middleware to all routes       |
| Default DB password        | 🟠 HIGH     | app/db/config.ts              | 24      | Remove default, require env var, throw error if missing        |
| Using postgres superuser   | 🟠 HIGH     | app/db/config.ts              | 23      | Create dedicated app user, prevent postgres user in production |
| Missing OAuth validation   | 🟠 HIGH     | app/api/routes/oauth/gmail.ts | 21,111  | Add Zod schemas for query params                               |
| Missing auth validation    | 🟠 HIGH     | app/api/routes/auth.ts        | 116,214 | Add Zod schemas for Google auth and forgot password            |
| Missing query validation   | 🟠 HIGH     | app/api/routes/phishing.ts    | 101,258 | Add Zod schemas for query parameters                           |
| Docker default passwords   | 🟡 MEDIUM   | docker-compose.yml            | 7-9     | Use environment variables with required flags                  |
| No read/write separation   | 🟡 MEDIUM   | app/db/connection.ts          | 18-43   | Document limitation, plan for future scaling                   |
| SSL disabled in dev        | 🟡 MEDIUM   | app/db/config.ts              | 25      | Add DB_SSL env var option                                      |

---

## Acceptance Criteria Status

### ✅ TLS is Enforced Correctly

**Status:** ❌ **FAIL** - HTTPS not configured, HTTP redirects missing, HSTS not enabled

### ✅ No High-Severity Secret Leaks Exist

**Status:** ⚠️ **PARTIAL** - No hardcoded secrets found, but default passwords exist

### ✅ No Plaintext or Logged Secrets

**Status:** ✅ **PASS** - No secrets found in logs or code

### ✅ Rate Limiting & Input Validation Implemented

**Status:** ⚠️ **PARTIAL** - Rate limiting only in nginx, missing validation on some routes

### ✅ DB Access Uses Least Privilege

**Status:** ❌ **FAIL** - Using postgres superuser, no dedicated app user

---

## Priority Recommendations

### Immediate (Before Production)

1. **Enable HTTPS** - Configure SSL certificates, uncomment HTTPS in nginx, add redirects
2. **Add Application Rate Limiting** - Install and configure express-rate-limit
3. **Remove Default Passwords** - Require all DB credentials via environment variables
4. **Create Database User** - Set up dedicated app user with minimal privileges

### High Priority (Before MVP Launch)

1. **Add Missing Input Validation** - Create Zod schemas for all OAuth and auth routes
2. **Enforce HTTPS in Code** - Add middleware to redirect HTTP to HTTPS
3. **Update Environment Variables** - Ensure all URLs use HTTPS in production

### Medium Priority (Post-MVP)

1. **Implement Read/Write Separation** - For better scalability
2. **Add Database Connection Monitoring** - Track connection pool usage
3. **Enhance Logging** - Add security event logging for failed auth attempts

---

## Conclusion

The codebase shows good security practices in several areas (parameterized queries, Zod validation, secrets in env vars), but critical gaps exist in TLS enforcement and rate limiting. **These must be addressed before production deployment.**

**Overall Security Score: 6/10** (Good foundation, needs critical fixes)
