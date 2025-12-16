# Gmail Pub/Sub Permissions Setup

## Problem

When setting up Gmail watch subscriptions, you may encounter this error:

```
Error: User not authorized to perform this action.
Error sending test message to Cloud PubSub projects/{project}/topics/{topic}
```

## Root Cause

Gmail needs permission to publish messages to your Pub/Sub topic. When you call `gmail.users.watch()`, Gmail verifies it can publish to the topic by sending a test message.

## Solution

Grant Gmail's service account permission to publish to your Pub/Sub topic.

### Step 1: Grant Gmail Service Account Permissions

Gmail uses a special service account: `gmail-api-push@system.gserviceaccount.com`

You need to grant this service account the **Pub/Sub Publisher** role on your topic.

### Option A: Using Google Cloud Console (Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Pub/Sub** > **Topics**
3. Click on your topic (e.g., `gmail-notifications`)
4. Click the **PERMISSIONS** tab
5. Click **ADD PRINCIPAL**
6. In **New principals**, enter: `gmail-api-push@system.gserviceaccount.com`
7. Select role: **Pub/Sub Publisher** (or `roles/pubsub.publisher`)
8. Click **SAVE**

### Option B: Using gcloud CLI

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Grant Gmail service account permission to publish
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

### Option C: Using Terraform

```hcl
resource "google_pubsub_topic_iam_member" "gmail_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.gmail_notifications.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:gmail-api-push@system.gserviceaccount.com"
}
```

## Verification

After granting permissions, test the watch setup:

1. Try connecting a Gmail account again
2. The watch should be created successfully
3. Check logs - you should see: "Gmail watch subscription created successfully"

## Additional Permissions

Your application's service account also needs:

- **Pub/Sub Subscriber** (`roles/pubsub.subscriber`) - To receive push notifications
- **Pub/Sub Viewer** (`roles/pubsub.viewer`) - To verify topic/subscription exists

But Gmail's service account only needs **Pub/Sub Publisher**.

## Troubleshooting

### Domain Restricted Sharing Policy Error

If you see this error:

```
The 'Domain Restricted Sharing' organization policy is enforced.
Only principals in allowed domains can be added as principals in the policy.
```

**⚠️ CRITICAL: This blocks Gmail Push Notifications**

Gmail **MUST** use its own service account (`gmail-api-push@system.gserviceaccount.com`) to publish to Pub/Sub. There is **no workaround** - this is a hard requirement from Google.

**Required Solution:**

**Contact your Google Workspace/Cloud Identity Organization Admin** to modify the Domain Restricted Sharing policy:

**Option 1: Disable the Policy (Recommended for Gmail Integration)**

1. Go to **Google Cloud Console** > **IAM & Admin** > **Organization Policies**
2. Find: **Domain Restricted Sharing** (`constraints/iam.allowedPolicyMemberDomains`)
3. Click **EDIT** and set to **Not enforced** or **Custom**
4. If Custom, ensure it allows external service accounts

**Option 2: Add Exception for Google Service Accounts**

1. Go to **Google Cloud Console** > **IAM & Admin** > **Organization Policies**
2. Find: **Domain Restricted Sharing** (`constraints/iam.allowedPolicyMemberDomains`)
3. Add exception/condition to allow `system.gserviceaccount.com` domain
4. Or add exception for service accounts ending in `@system.gserviceaccount.com`

**Option 3: Use Policy Condition (If Policy Must Stay Active)**

If the policy must remain active, configure it to allow Google-managed service accounts:

- Add condition: Allow principals matching `*@system.gserviceaccount.com`
- Or disable the policy for this specific project only

**Why This Is Required:**

- Gmail API push notifications **require** Gmail's service account to publish to your Pub/Sub topic
- Gmail cannot use your organization's service accounts
- The Domain Restricted Sharing policy blocks external domains by default
- `system.gserviceaccount.com` is Google's domain for managed service accounts

**Alternative (If Policy Cannot Be Changed):**

If your organization absolutely cannot modify the policy, you'll need to:

- **Fall back to polling** (the old system) - Gmail watch won't work without Pub/Sub permissions
- Or use a **separate GCP project** without domain restrictions for Gmail integration

### Still Getting Permission Errors?

1. **Wait a few minutes** - IAM changes can take 1-2 minutes to propagate
2. **Verify the topic exists** - Make sure the topic name matches exactly
3. **Check project ID** - Ensure `GOOGLE_CLOUD_PROJECT_ID` matches your GCP project
4. **Verify service account** - The exact account is `gmail-api-push@system.gserviceaccount.com` (no custom domain)

### Check Current Permissions

```bash
# List IAM policy for the topic
gcloud pubsub topics get-iam-policy gmail-notifications
```

You should see `gmail-api-push@system.gserviceaccount.com` with role `roles/pubsub.publisher`.

## Important Notes

- **Gmail's service account is managed by Google** - You cannot modify it, only grant it permissions
- **The account is the same for all GCP projects** - `gmail-api-push@system.gserviceaccount.com`
- **Permissions are per-topic** - Grant permissions on each topic Gmail needs to publish to
- **No credentials needed** - Gmail handles authentication automatically
