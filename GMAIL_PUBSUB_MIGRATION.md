# Gmail Pub/Sub Push Notifications Migration Guide

This document describes the migration from polling-based Gmail monitoring to event-driven push notifications using Google Cloud Pub/Sub.

## Overview

The system has been migrated from a polling-based architecture (checking Gmail every 60-120 seconds) to an event-driven architecture using Gmail Push Notifications via Google Cloud Pub/Sub. This provides:

- **Instant email processing** - Emails are processed immediately when they arrive
- **Reduced API quota usage** - No more constant polling
- **Better scalability** - Event-driven architecture scales better
- **Lower latency** - Real-time threat detection

## Architecture Changes

### Before (Polling)

```
┌─────────────┐
│  Scheduler  │─── Every 60-120s ───┐
└─────────────┘                      │
                                     ▼
                            ┌─────────────────┐
                            │  Gmail API      │
                            │  (Polling)      │
                            └─────────────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │ Email Monitor    │
                            │ (Process)       │
                            └─────────────────┘
```

### After (Event-Driven)

```
┌─────────────┐
│   Gmail     │─── New Email ───┐
└─────────────┘                 │
                                 ▼
                        ┌─────────────────┐
                        │  Pub/Sub Topic  │
                        └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Push Subscription│
                        └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ /api/gmail-notify│
                        │ (Webhook)       │
                        └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Email Monitor    │
                        │ (Process)        │
                        └─────────────────┘
```

## New Components

### 1. Pub/Sub Service (`app/api/services/pubsub/pubsubService.ts`)

- Manages Google Cloud Pub/Sub topic and subscription
- Ensures topic/subscription exist on startup
- Handles Pub/Sub configuration

### 2. Gmail Watch API (`app/api/services/oauth/gmail/GmailOAuthService/watch.ts`)

- Sets up Gmail mailbox watch subscriptions
- Manages watch expiration (7-day limit)
- Handles watch renewal

### 3. Webhook Endpoint (`app/api/routes/gmail-notify.ts`)

- Receives push notifications from Pub/Sub
- Processes new emails via Gmail history API
- Handles errors and retries

### 4. Watch Renewal Scheduler (`app/api/services/watchRenewalScheduler.ts`)

- Automatically renews Gmail watches every 24 hours
- Ensures watches don't expire
- Runs as a background service

### 5. Refactored Email Monitor (`app/api/services/emailMonitor.ts`)

- Removed all polling logic
- Added `processNewEmailsFromHistory()` for event-driven processing
- Added `performFullSyncFallback()` for error recovery
- Kept all email processing logic intact

## Database Schema Changes

### New Table: `gmail_watches`

```sql
CREATE TABLE IF NOT EXISTS gmail_watches (
    business_id INTEGER NOT NULL,
    email_address TEXT NOT NULL,
    watch_expiration TIMESTAMP WITH TIME ZONE NOT NULL,
    history_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_id, email_address)
);
```

This table stores:

- Watch expiration timestamps (Gmail watches expire after 7 days)
- Current historyId for each mailbox
- Tracks which emails have active watch subscriptions

## Configuration Variables

### Required Environment Variables

```bash
# Google Cloud Project ID (for Pub/Sub)
GOOGLE_CLOUD_PROJECT_ID=your-project-id

# Pub/Sub Configuration (optional - defaults provided)
GMAIL_PUBSUB_TOPIC=gmail-notifications
GMAIL_PUBSUB_SUBSCRIPTION=gmail-notify-sub
```

### Existing Variables (Still Required)

```bash
# Gmail OAuth (already configured)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/oauth/gmail/callback

# Frontend URL
FRONTEND_URL=https://yourdomain.com
```

## Migration Steps

### 1. Install Dependencies

```bash
npm install @google-cloud/pubsub
```

### 2. Run Database Migration

The schema changes are included in `app/db/schema.sql`. Run migrations:

```bash
npm run db:migrate
```

Or manually execute the SQL to create the `gmail_watches` table.

### 3. Set Up Google Cloud Pub/Sub

#### Manual Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to Pub/Sub > Topics
3. Create topic: `gmail-notifications` (or your custom name)
4. Create subscription: `gmail-notify-sub` (push type)
5. Set push endpoint: `https://yourdomain.com/api/gmail-notify`
6. Configure authentication (OIDC recommended)

### 4. Update Environment Variables

Add the new Pub/Sub configuration variables to your `.env` file:

```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

### 5. Grant Required Permissions

Ensure your Google Cloud service account has:

- **Pub/Sub Admin** - To create/manage topics and subscriptions
- **Gmail API** - Already configured for OAuth

### 6. Deploy and Test

1. Deploy the updated code
2. Test OAuth connection - watch should be created automatically
3. Send a test email to a monitored address
4. Verify it's processed immediately (check logs)

## How It Works

### 1. User Connects Gmail

- User completes OAuth flow
- System calls `gmail.watch()` API with Pub/Sub topic
- Gmail returns `historyId` and expiration timestamp
- Watch stored in `gmail_watches` table

### 2. New Email Arrives

- Gmail detects new message in INBOX
- Gmail publishes notification to Pub/Sub topic
- Pub/Sub pushes message to `/api/gmail-notify` webhook
- Webhook extracts `historyId` from notification

### 3. Email Processing

- Webhook calls `gmail.history.list()` with previous `historyId`
- Gets list of new message IDs
- Fetches full message details
- Processes through phishing detector
- Updates stored `historyId`

### 4. Watch Renewal

- Scheduler checks watches every hour
- Finds watches expiring within 24 hours
- Calls `gmail.watch()` to renew each watch
- Updates expiration timestamp in database

## Error Handling

### HistoryId Too Old

If `historyId` is stale (older than Gmail's retention), the system:

1. Detects the error
2. Falls back to full sync using `fetchEmails()` with timestamp
3. Processes all emails since OAuth connection
4. Updates `historyId` to current value

### Watch Expiration

- Watches expire after 7 days (Gmail limit)
- Renewal scheduler renews watches every 24 hours
- If renewal fails, system retries on next cycle
- Manual renewal available via API

### Pub/Sub Delivery Failures

- Pub/Sub retries failed deliveries automatically
- Webhook returns 500 for errors to trigger retry
- Webhook returns 200 to acknowledge successful processing
- Dead letter queue configured for persistent failures

## API Changes

### Removed Endpoints

- `POST /api/phishing/monitoring/start` - Now uses `initialize()` (event-driven)
- `POST /api/phishing/monitoring/stop` - Only stops maintenance tasks

### New Endpoints

- `POST /api/gmail-notify` - Pub/Sub webhook (internal, called by Google)

### Updated Endpoints

- `GET /api/phishing/monitoring/status` - Returns `mode: 'event-driven'`

## Monitoring and Logging

### Key Log Messages

**Watch Creation:**

```
Gmail watch subscription created successfully
operation: watch-mailbox
metadata: { historyId, expiration, topicName }
```

**Push Notification Received:**

```
Received Gmail push notification
operation: gmail-notify
metadata: { emailAddress, historyId, messageId }
```

**Watch Renewal:**

```
Gmail watch renewed successfully
operation: renew-watch
metadata: { businessId, emailAddress, historyId, expiration }
```

### Monitoring Queries

**Check Active Watches:**

```sql
SELECT business_id, email_address, watch_expiration, history_id
FROM gmail_watches
WHERE watch_expiration > NOW();
```

**Check Watches Needing Renewal:**

```sql
SELECT business_id, email_address, watch_expiration
FROM gmail_watches
WHERE watch_expiration < NOW() + INTERVAL '24 hours'
ORDER BY watch_expiration ASC;
```

## Troubleshooting

### Watches Not Being Created

- Check OAuth tokens are valid
- Verify `GOOGLE_CLOUD_PROJECT_ID` is set
- Check Pub/Sub topic exists and has correct permissions
- Review logs for Gmail API errors

### Notifications Not Received

- Verify webhook URL is accessible from internet
- Check Pub/Sub subscription push configuration
- Verify OIDC authentication if configured
- Check webhook logs for errors

### Emails Not Processing

- Check `email_offsets` table for stored `historyId`
- Verify `processed_emails` table for deduplication
- Review webhook logs for processing errors
- Check Gmail API quota limits

### Watch Expiration Issues

- Verify renewal scheduler is running
- Check `gmail_watches` table for expiration timestamps
- Review renewal logs for errors
- Manually renew watches if needed

## Rollback Plan

If you need to rollback to polling:

1. Revert `emailMonitor.ts` to previous version
2. Revert `startup.ts` to call `startMonitoring()`
3. Remove Pub/Sub webhook route
4. Keep database changes (they're backward compatible)

## Performance Improvements

- **Latency**: Reduced from 60-120s to <1s (instant processing)
- **API Quota**: Reduced by ~99% (no polling, only on-demand)
- **Scalability**: Event-driven architecture handles load better
- **Cost**: Lower Gmail API usage, minimal Pub/Sub costs

## Security Considerations

1. **Webhook Authentication**: Use OIDC tokens for Pub/Sub push authentication
2. **HTTPS Only**: Webhook must be HTTPS in production
3. **Message Verification**: Verify Pub/Sub message authenticity (implemented)
4. **Rate Limiting**: Webhook endpoint should have rate limiting
5. **Error Handling**: Don't expose internal errors in webhook responses

## Next Steps

1. Monitor watch renewals for first 7 days
2. Verify all emails are processed correctly
3. Check Pub/Sub metrics for delivery success rate
4. Review logs for any errors or warnings
5. Consider adding monitoring/alerting for watch expiration

## Support

For issues or questions:

- Check application logs for detailed error messages
- Review Google Cloud Pub/Sub metrics
- Verify Gmail API quota usage
- Check database for watch expiration status
