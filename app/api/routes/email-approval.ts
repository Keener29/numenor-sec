import { Router } from 'express';
import { query } from '../../db/connection.js';
import { tokenService } from '../utils/tokenService.js';

const router = Router();

// Approve email monitoring (set as connected)
router.post('/:id/approve', async (req, res, next) => {
  try {
    const emailId = req.params.id;
    const { businessId, token } = req.body;
    
    // Validate required parameters
    if (!businessId || !token) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Verify the approval token using secure validation
    if (!tokenService.validateApprovalToken(token, parseInt(emailId), parseInt(businessId))) {
      return res.status(403).json({ error: 'Invalid or expired approval token' });
    }

    // Verify the email exists and belongs to the business
    const emailResult = await query(
      `SELECT me.id, me.email_address, me.is_connected, b.name as business_name
       FROM monitored_emails me
       JOIN businesses b ON me.business_id = b.id
       WHERE me.id = $1 AND me.business_id = $2`,
      [emailId, businessId]
    );

    if (emailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const businessName = emailResult.rows[0].business_name;
    const isConnected = emailResult.rows[0].is_connected;

    // Check if email is already connected (prevent duplicate approval)
    if (isConnected) {
      // Log duplicate approval attempt
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'duplicate_approval_attempt', $2, $3, $4)`,
        [businessId, `Duplicate approval attempt for already connected email: ${emailResult.rows[0].email_address}`, req.ip, req.get('User-Agent')]
      );

      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Already Approved</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px; 
              background-color: #f9fafb; 
              margin: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              padding: 40px; 
              border-radius: 8px; 
              box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
            }
            .info { color: #6b7280; font-size: 2em; margin-bottom: 20px; }
            .button { 
              display: inline-block; 
              background-color: #3b82f6; 
              color: white; 
              padding: 12px 24px; 
              text-decoration: none; 
              border-radius: 6px; 
              margin-top: 20px; 
              border: none;
              cursor: pointer;
            }
            .button:hover { background-color: #2563eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="info">ℹ️ Already Approved</h1>
            <p><strong>${businessName}</strong> is already monitoring <strong>${emailResult.rows[0].email_address}</strong>.</p>
            <p>This email address was previously approved and is currently being monitored for security threats.</p>
            <button onclick="window.close(); return false;" class="button">Close Window</button>
          </div>
        </body>
        </html>
      `);
    }

    // Update email to connected
    await query(
      `UPDATE monitored_emails 
       SET is_connected = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND business_id = $2`,
      [emailId, businessId]
    );

    // Log the approval event
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_approved', $2, $3, $4)`,
      [businessId, `Email monitoring approved for: ${emailResult.rows[0].email_address}`, req.ip, req.get('User-Agent')]
    );

    // Return HTML response page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Permission Granted</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background-color: #f9fafb; 
            margin: 0;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            padding: 40px; 
            border-radius: 8px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
          }
          .success { color: #10b981; font-size: 2em; margin-bottom: 20px; }
          .button { 
            display: inline-block; 
            background-color: #3b82f6; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            margin-top: 20px; 
            border: none;
            cursor: pointer;
          }
          .button:hover { background-color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="success">✅ Permission Granted</h1>
          <p><strong>${businessName}</strong> can now monitor <strong>${emailResult.rows[0].email_address}</strong> for security threats.</p>
          <p>Thank you for helping protect your organization's email security!</p>
          <button onclick="window.close(); return false;" class="button">Close Window</button>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background-color: #f9fafb; 
            margin: 0;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            padding: 40px; 
            border-radius: 8px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
          }
          .error { color: #dc2626; font-size: 2em; margin-bottom: 20px; }
          .button { 
            display: inline-block; 
            background-color: #3b82f6; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            margin-top: 20px; 
            border: none;
            cursor: pointer;
          }
          .button:hover { background-color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="error">❌ Error</h1>
          <p>An error occurred while processing your request. Please try again later.</p>
          <button onclick="window.close(); return false;" class="button">Close Window</button>
        </div>
      </body>
      </html>
    `);
  }
});

// Decline email monitoring (remove from monitoring)
router.post('/:id/decline', async (req, res, next) => {
  try {
    const emailId = req.params.id;
    const { businessId, token } = req.body;
    
    // Validate required parameters
    if (!businessId || !token) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Verify the decline token using secure validation
    if (!tokenService.validateDeclineToken(token, parseInt(emailId), parseInt(businessId))) {
      return res.status(403).json({ error: 'Invalid or expired decline token' });
    }

    // Get email and business info before deletion for logging
    const emailResult = await query(
      `SELECT me.id, me.email_address, me.is_connected, b.name as business_name
       FROM monitored_emails me
       JOIN businesses b ON me.business_id = b.id
       WHERE me.id = $1 AND me.business_id = $2`,
      [emailId, businessId]
    );

    if (emailResult.rows.length === 0) {
      // Log duplicate decline attempt
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'duplicate_decline_attempt', $2, $3, $4)`,
        [businessId, `Duplicate decline attempt for already declined/removed email: ${emailId}`, req.ip, req.get('User-Agent')]
      );

      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Already Declined</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px; 
              background-color: #f9fafb; 
              margin: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              padding: 40px; 
              border-radius: 8px; 
              box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
            }
            .info { color: #6b7280; font-size: 2em; margin-bottom: 20px; }
            .button { 
              display: inline-block; 
              background-color: #3b82f6; 
              color: white; 
              padding: 12px 24px; 
              text-decoration: none; 
              border-radius: 6px; 
              margin-top: 20px; 
              border: none;
              cursor: pointer;
            }
            .button:hover { background-color: #2563eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="info">ℹ️ Already Declined</h1>
            <p>This email monitoring request has already been declined or removed.</p>
            <p>The email address is not being monitored for security threats.</p>
            <button onclick="window.close(); return false;" class="button">Close Window</button>
          </div>
        </body>
        </html>
      `);
    }

    const emailAddress = emailResult.rows[0].email_address;
    const businessName = emailResult.rows[0].business_name;
    const isConnected = emailResult.rows[0].is_connected;

    // Check if email is already connected (prevent decline after approval)
    if (isConnected) {
      // Log decline attempt on already approved email
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'decline_after_approval_attempt', $2, $3, $4)`,
        [businessId, `Decline attempt on already approved email: ${emailAddress}`, req.ip, req.get('User-Agent')]
      );

      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Cannot Decline</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px; 
              background-color: #f9fafb; 
              margin: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              padding: 40px; 
              border-radius: 8px; 
              box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
            }
            .warning { color: #f59e0b; font-size: 2em; margin-bottom: 20px; }
            .button { 
              display: inline-block; 
              background-color: #3b82f6; 
              color: white; 
              padding: 12px 24px; 
              text-decoration: none; 
              border-radius: 6px; 
              margin-top: 20px; 
              border: none;
              cursor: pointer;
            }
            .button:hover { background-color: #2563eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="warning">⚠️ Cannot Decline</h1>
            <p><strong>${businessName}</strong> is already monitoring <strong>${emailAddress}</strong>.</p>
            <p>This email address was previously approved and is currently being monitored. To stop monitoring, please contact the business directly.</p>
            <button onclick="window.close(); return false;" class="button">Close Window</button>
          </div>
        </body>
        </html>
      `);
    }

    // Delete the email from monitoring
    await query('DELETE FROM monitored_emails WHERE id = $1 AND business_id = $2', [emailId, businessId]);

    // Log the decline event
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_declined', $2, $3, $4)`,
      [businessId, `Email monitoring declined for: ${emailAddress}`, req.ip, req.get('User-Agent')]
    );

    // Return HTML response page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Permission Denied</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background-color: #f9fafb; 
            margin: 0;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            padding: 40px; 
            border-radius: 8px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
          }
          .info { color: #6b7280; font-size: 2em; margin-bottom: 20px; }
          .button { 
            display: inline-block; 
            background-color: #3b82f6; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            margin-top: 20px; 
            border: none;
            cursor: pointer;
          }
          .button:hover { background-color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="info">❌ Permission Denied</h1>
          <p><strong>${businessName}</strong> will not monitor <strong>${emailAddress}</strong>.</p>
          <p>The email has been removed from monitoring as requested.</p>
          <button onclick="window.close(); return false;" class="button">Close Window</button>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Decline error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background-color: #f9fafb; 
            margin: 0;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            padding: 40px; 
            border-radius: 8px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
          }
          .error { color: #dc2626; font-size: 2em; margin-bottom: 20px; }
          .button { 
            display: inline-block; 
            background-color: #3b82f6; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            margin-top: 20px; 
            border: none;
            cursor: pointer;
          }
          .button:hover { background-color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="error">❌ Error</h1>
          <p>An error occurred while processing your request. Please try again later.</p>
          <button onclick="window.close(); return false;" class="button">Close Window</button>
        </div>
      </body>
      </html>
    `);
  }
});

export default router;
