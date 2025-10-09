# Gmail OAuth 2.0 Setup Guide

This guide explains how to set up Gmail OAuth 2.0 integration for secure email monitoring without requiring user passwords.

## Overview

The system now uses Google's OAuth 2.0 flow to securely access Gmail accounts for phishing detection monitoring. This approach is more secure and user-friendly than requiring email passwords.

## Prerequisites

1. Google Cloud Console project
2. Gmail API enabled
3. OAuth 2.0 credentials configured

## Step 1: Google Cloud Console Setup

### 1.1 Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 1.2 Enable Gmail API
1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Gmail API"
3. Click on "Gmail API" and then "Enable"

### 1.3 Required Gmail API Scopes
The application requests the following OAuth scopes:
- `https://www.googleapis.com/auth/gmail.readonly` - Read emails for phishing analysis
- `https://www.googleapis.com/auth/gmail.modify` - Delete/move phishing emails

**Note**: These are "Restricted" scopes that require Google verification for production use.

### 1.4 Create OAuth 2.0 Credentials
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Web application" as the application type
4. Add authorized redirect URIs:
   - For development: `http://localhost:3001/api/oauth2callback`
   - For production: `https://yourdomain.com/api/oauth2callback`
5. Save and note your Client ID and Client Secret

## Step 2: Environment Configuration

Add the following environment variables to your `.env` file:

```env
# Gmail OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3001/api/oauth2callback

# Frontend URL for OAuth redirects
FRONTEND_URL=http://localhost:3000
```

## Step 3: OAuth Scopes

The application requests the following Gmail API scopes:

- `https://www.googleapis.com/auth/gmail.readonly` - Read emails
- `https://www.googleapis.com/auth/gmail.modify` - Mark emails as read

These scopes allow the application to:
- Read unread emails for phishing detection
- Mark processed emails as read
- Access email metadata (sender, subject, body, etc.)

## Step 4: How It Works

### 4.1 User Flow
1. User adds an email address for monitoring
2. User clicks "Connect Gmail" button
3. System redirects to Google OAuth consent screen
4. User grants permissions to the application
5. Google redirects back with authorization code
6. System exchanges code for access and refresh tokens
7. Tokens are securely stored in database
8. Email monitoring begins using Gmail API

### 4.2 Technical Flow
1. **Authorization**: Generate OAuth URL with business ID and email address in state
2. **Callback**: Handle OAuth callback, exchange code for tokens
3. **Storage**: Store encrypted tokens in `oauth_tokens` table
4. **Monitoring**: Use stored tokens to fetch emails via Gmail API
5. **Refresh**: Automatically refresh expired access tokens using refresh token

## Step 5: API Endpoints

### OAuth Endpoints

- `GET /api/auth-url?emailAddress=user@example.com` - Generate OAuth URL
- `GET /api/oauth2callback` - Handle OAuth callback
- `POST /api/oauth/gmail/disconnect` - Disconnect Gmail account
- `GET /api/oauth/gmail/status/:emailAddress` - Check connection status
- `POST /api/oauth/gmail/test` - Test Gmail connection

### Example Usage

```javascript
// Generate OAuth URL
const response = await fetch('/api/oauth/gmail/connect?emailAddress=user@example.com', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { authUrl } = await response.json();

// Open OAuth flow
window.open(authUrl, 'gmail-oauth', 'width=600,height=700');
```

## Step 6: Database Schema

The `oauth_tokens` table stores OAuth credentials:

```sql
CREATE TABLE oauth_tokens (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL,
    email_address VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    scope TEXT NOT NULL,
    token_type VARCHAR(50) NOT NULL DEFAULT 'Bearer',
    expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (business_id, email_address)
);
```

## Step 7: Security Considerations

### 7.1 Token Security
- Access tokens are stored encrypted in the database
- Refresh tokens are used to automatically renew expired access tokens
- Tokens are scoped to specific business and email address

### 7.2 OAuth State Parameter
- State parameter includes business ID and email address
- Prevents CSRF attacks and ensures tokens are associated with correct account

### 7.3 Token Refresh
- Access tokens expire after 1 hour
- System automatically refreshes tokens using refresh token
- Refresh tokens are long-lived and don't expire unless revoked

## Step 8: Error Handling

### Common OAuth Errors
- `access_denied` - User denied permission
- `invalid_request` - Malformed OAuth request
- `invalid_client` - Invalid client credentials
- `invalid_grant` - Invalid or expired authorization code

### Fallback Behavior
- If OAuth fails, system falls back to simulated email monitoring
- Users can retry OAuth connection at any time
- Disconnected accounts continue to show in monitoring list

## Step 9: Production Deployment

### 9.1 Environment Variables
Update production environment variables:
```env
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/oauth2callback
FRONTEND_URL=https://yourdomain.com
```

### 9.2 Google Cloud Console
1. Add production redirect URI to OAuth credentials
2. Update authorized domains if needed
3. Configure OAuth consent screen for production

### 9.3 SSL/HTTPS
- OAuth requires HTTPS in production
- Ensure all redirect URIs use HTTPS
- Update Google Cloud Console with production URLs

## Step 10: Testing

### 10.1 Test OAuth Flow
1. Add a monitored email address
2. Click "Connect Gmail" button
3. Complete OAuth flow in popup window
4. Verify connection status shows "Connected"
5. Test email monitoring functionality

### 10.2 Test Connection
Use the "Test Connection" button to verify:
- OAuth tokens are valid
- Gmail API access is working
- Email fetching is successful

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI" or "redirect_uri_mismatch"**
   - Check that redirect URI in Google Cloud Console matches environment variable exactly
   - Ensure protocol (http/https) matches your environment
   - Verify port number matches your API server (3001 for development)
   - Common mistake: Using port 3000 instead of 3001 (3000 is frontend, 3001 is API)
   - The URI must be exactly: `http://localhost:3001/api/oauth2callback` for development

2. **"Access denied"**
   - User may have denied permissions
   - Check OAuth consent screen configuration

3. **"Token expired"**
   - System should automatically refresh tokens
   - Check refresh token validity

4. **"API quota exceeded"**
   - Gmail API has daily quotas
   - Monitor API usage in Google Cloud Console

### Debug Mode
Enable debug logging by setting:
```env
DEBUG=gmail-oauth
```

### Quick Fix for redirect_uri_mismatch
If you're getting a `redirect_uri_mismatch` error:

1. **Check your Google Cloud Console:**
   - Go to "APIs & Services" > "Credentials"
   - Click on your OAuth 2.0 Client ID
   - In "Authorized redirect URIs", ensure you have exactly: `http://localhost:3001/api/oauth2callback`

2. **Verify your .env file:**
   ```env
   GOOGLE_REDIRECT_URI=http://localhost:3001/api/oauth2callback
   ```

3. **Restart your development server** after making changes

4. **Common mistakes to avoid:**
   - ❌ Using `https://` instead of `http://` for local development
   - ❌ Using port `3000` instead of `3001`
   - ❌ Missing the `/api/` prefix in the path
   - ❌ Having trailing slashes or extra characters

## Support

For issues with Gmail OAuth integration:
1. Check Google Cloud Console for API errors
2. Review application logs for OAuth flow errors
3. Verify environment variables are correctly set
4. Test OAuth flow in browser developer tools
