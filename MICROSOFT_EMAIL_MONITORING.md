# Microsoft Email Monitoring Implementation

## High-Level Architecture

```
┌─────────────────┐
│ Microsoft 365   │─── New Email ───┐
│   / Outlook     │                 │
└─────────────────┘                 │
                                    ▼
                        ┌──────────────────────┐
                        │ Graph Change         │
                        │ Notifications        │
                        │ (Webhook)            │
                        └──────────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │ Webhook Handler      │
                        │ /api/microsoft-notify│
                        │ (validationToken +   │
                        │  notification)      │
                        └──────────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │ MicrosoftEmailAdapter│
                        │ (Normalize Graph →   │
                        │  EmailMessage)       │
                        └──────────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │ EmailProcessor        │
                        │ (Existing Pipeline)   │
                        └──────────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │ PhishingDetector     │
                        │ ThreatAlertService   │
                        │ (Existing Logic)     │
                        └──────────────────────┘
```

## Microsoft Graph API Mapping

### 1. Subscription Creation
- **Gmail Equivalent**: `gmail.users.watch()` → Pub/Sub topic
- **Microsoft Graph**: `POST /subscriptions` → Change notifications webhook
- **Key Differences**:
  - Graph subscriptions expire (max 3 days, renewable)
  - Requires `validationToken` challenge-response
  - Webhook URL must be HTTPS
  - Supports resource filtering (e.g., `/me/messages`)

### 2. Notification Flow
- **Gmail**: Pub/Sub message → `historyId` → `history.list()` → `messages.get()`
- **Microsoft Graph**: Webhook → `changeType` + `resource` → `GET /me/messages/{id}`

### 3. Email Fetching
- **Gmail**: `messages.get(id, format='full')` → Parse MIME
- **Microsoft Graph**: `GET /me/messages/{id}?$expand=mimeContent` → Parse MIME

### 4. History Tracking
- **Gmail**: `historyId` stored in `email_offsets`
- **Microsoft Graph**: `deltaToken` or `lastModifiedDateTime` (stored similarly)

## Backend Flow (Step-by-Step)

### Subscription Creation Flow
1. User connects Microsoft account via OAuth
2. Store OAuth tokens in `oauth_tokens` (provider='microsoft')
3. Create Graph subscription: `POST /subscriptions`
   - Resource: `/me/messages`
   - ChangeType: `created`
   - NotificationUrl: `{API_URL}/api/microsoft-notify`
   - ExpirationDateTime: `now + 3 days`
4. Store subscription in `microsoft_subscriptions` table
5. Schedule renewal job (renew before expiration)

### Webhook Notification Flow
1. **Validation Request** (initial setup):
   - Microsoft sends `GET` with `validationToken` query param
   - Return `validationToken` as plain text (200 OK)
   - This validates webhook URL ownership

2. **Change Notification** (email received):
   - Microsoft sends `POST` with notification payload
   - Verify webhook signature (optional but recommended)
   - Extract `resource` (message ID) from notification
   - Fetch full message: `GET /me/messages/{id}`
   - Normalize via `MicrosoftEmailAdapter` → `EmailMessage`
   - Route to `emailProcessor.processEmailMessage()`
   - Existing phishing detection pipeline processes it

### Subscription Renewal Flow
1. Cron job runs every 6 hours
2. Query `microsoft_subscriptions` for expiring subscriptions (< 24h remaining)
3. For each subscription:
   - Get OAuth tokens for the email
   - Refresh token if needed
   - Call `PATCH /subscriptions/{id}` to extend expiration
   - Update `expiration_date` in database

### Fallback Polling Strategy
- If subscription expires and renewal fails:
  - Fall back to polling `GET /me/messages` with `$filter=receivedDateTime ge {lastChecked}`
  - Similar to Gmail's full sync fallback

## Database Schema

```sql
-- Microsoft Graph subscriptions (mirrors gmail_watches)
CREATE TABLE IF NOT EXISTS microsoft_subscriptions (
    business_id INTEGER NOT NULL,
    email_address TEXT NOT NULL,
    subscription_id TEXT NOT NULL UNIQUE,
    resource_path TEXT NOT NULL,
    expiration_date TIMESTAMP WITH TIME ZONE NOT NULL,
    last_notification_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_id, email_address),
    CONSTRAINT fk_microsoft_subscriptions_business_id 
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Index for renewal queries
CREATE INDEX IF NOT EXISTS idx_microsoft_subscriptions_expiration 
    ON microsoft_subscriptions(expiration_date);
```

## Security Considerations

### 1. Webhook Validation
- **validationToken Challenge**: Microsoft sends `validationToken` in query string
- Return it as plain text (200 OK) to prove ownership
- Implemented in webhook handler

### 2. Webhook Signature Verification (Optional but Recommended)
- Microsoft Graph supports `X-Signature-256` header
- Verify HMAC-SHA256 signature using client secret
- Prevents spoofed notifications

### 3. Tenant Isolation
- Each business has separate OAuth tokens
- Subscriptions scoped to specific mailbox (`/me/messages`)
- Database queries filtered by `business_id`

### 4. Least Privilege Scopes
- Required Graph permissions:
  - `Mail.Read` - Read mailbox messages
  - `offline_access` - Refresh tokens
- No write permissions needed

### 5. Token Security
- Store tokens encrypted at rest (if possible)
- Refresh tokens before expiration
- Revoke tokens on disconnect

## Microsoft Graph APIs Required

1. **Subscription Management**:
   - `POST /subscriptions` - Create subscription
   - `PATCH /subscriptions/{id}` - Renew subscription
   - `DELETE /subscriptions/{id}` - Delete subscription
   - `GET /subscriptions` - List subscriptions

2. **Email Operations**:
   - `GET /me/messages` - List messages (fallback polling)
   - `GET /me/messages/{id}` - Get message details
   - `GET /me/messages/{id}/$value` - Get MIME content

3. **OAuth**:
   - Token refresh: `POST /oauth2/v2.0/token`
   - Already implemented in `loginWithMicrosoft`

## Code Structure

```
app/api/
├── services/
│   ├── oauth/
│   │   ├── microsoft/
│   │   │   ├── MicrosoftOAuthService.ts      (extends OAuthProvider)
│   │   │   ├── MicrosoftEmailAdapter.ts      (normalizes Graph → EmailMessage)
│   │   │   ├── subscriptionService.ts       (create/renew/delete subscriptions)
│   │   │   └── graphClient.ts                (Graph API client wrapper)
│   │   └── base/
│   │       └── OAuthProvider.ts              (existing base class)
│   └── emailMonitor/
│       └── microsoftEmailSyncService.ts      (similar to EmailSyncService)
├── routes/
│   └── microsoft-notify.ts                   (webhook handler, mirrors gmail-notify.ts)
└── jobs/
    └── microsoftSubscriptionRenewal.ts      (cron job for renewal)
```

## Environment Variables

```bash
# Microsoft Graph (already exists for login)
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_REDIRECT_URI=...

# Microsoft Graph API
MICROSOFT_GRAPH_API_URL=https://graph.microsoft.com/v1.0
MICROSOFT_WEBHOOK_URL=https://your-api.com/api/microsoft-notify

# Subscription settings
MICROSOFT_SUBSCRIPTION_EXPIRATION_HOURS=72  # Max 3 days
MICROSOFT_SUBSCRIPTION_RENEWAL_THRESHOLD_HOURS=24  # Renew when < 24h left
```

## Integration Points

### Existing Services (No Changes Required)
- ✅ `emailProcessor.processEmailMessage()` - Processes normalized EmailMessage
- ✅ `phishingDetector.analyzeEmail()` - Analyzes email content
- ✅ `threatAlertService.sendThreatAlert()` - Sends alerts
- ✅ `processedEmailsService` - Deduplication

### New Services (Microsoft-Specific)
- `MicrosoftOAuthService` - OAuth + Graph API client
- `MicrosoftEmailAdapter` - Graph message → EmailMessage
- `MicrosoftSubscriptionService` - Subscription lifecycle
- `MicrosoftEmailSyncService` - Email fetching + processing

## Error Handling

### Subscription Expiration
- If subscription expires: Fall back to polling
- Log warning and attempt renewal

### Webhook Failures
- If webhook validation fails: Return 401, log error
- If notification processing fails: Return 500, Microsoft will retry

### Rate Limits
- Graph API: 10,000 requests per 10 minutes per app
- Implement exponential backoff
- Queue notifications if rate limited

## Testing Strategy

1. **Unit Tests**:
   - `MicrosoftEmailAdapter` normalization
   - Subscription service CRUD operations
   - Webhook validation logic

2. **Integration Tests**:
   - End-to-end webhook → detection pipeline
   - Subscription renewal flow
   - Fallback polling

3. **Manual Testing**:
   - Connect Microsoft account
   - Send test email
   - Verify notification received
   - Verify phishing detection works

