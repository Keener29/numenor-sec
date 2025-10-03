# Email Service Setup

This document explains how to configure the email service for sending permission request emails when new email addresses are added for monitoring.

## Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Email Service Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Numenor Security <your-email@gmail.com>

# Note: Business contact information is now automatically retrieved from the database
# The system will use the business owner's email address from the users table
```

## Gmail Setup (Recommended)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
   - Use this password as `SMTP_PASS`

3. **Configuration**:
   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-gmail@gmail.com
   SMTP_PASS=your-16-character-app-password
   ```

## Other Email Providers

### Outlook/Hotmail
```bash
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
```

### Yahoo
```bash
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_SECURE=false
```

### Custom SMTP Server
```bash
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASS=your-password
```

## Testing the Email Service

You can test the email service by adding a new email address through the dashboard. The system will:

1. Add the email to the monitoring list
2. Send a formal permission request email
3. Log the email sending event in the security events

## Email Template

The permission request email includes:

- **Professional Design**: Clean, responsive HTML template
- **Clear Purpose**: Explains why monitoring is requested
- **Privacy Information**: Details about what data is accessed
- **Action Buttons**: Easy grant/deny permission options
- **Legal Compliance**: Includes privacy notices and contact information
- **Business Branding**: Uses the business name throughout

## Troubleshooting

### Common Issues

1. **Authentication Failed**: Check your SMTP credentials and app password
2. **Connection Timeout**: Verify SMTP host and port settings
3. **Emails Not Sending**: Check firewall settings and email provider restrictions

### Logs

Check the console logs for email service errors:
- `Permission request email sent to: [email]` - Success
- `Failed to send permission request email: [error]` - Failure

### Security Events

Monitor the security events table for email-related activities:
- `permission_email_sent` - Email sent successfully
- `permission_email_failed` - Email sending failed

## Production Considerations

1. **Use a dedicated email service** (SendGrid, Mailgun, AWS SES) for production
2. **Set up proper DNS records** (SPF, DKIM, DMARC) for better deliverability
3. **Monitor email delivery rates** and bounce handling
4. **Implement rate limiting** to prevent abuse
5. **Use environment-specific configurations** for different deployment stages
