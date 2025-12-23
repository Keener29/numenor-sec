/**
 * Monitored Email Database Utilities
 * Shared database query functions for finding monitored email records
 */

import { query } from '../../db/connection.js';
import type { EmailRecord } from '../types/email.js';

/**
 * Find monitored email record for the given email address
 * Filters by OAuth provider to ensure we get the correct connection
 * 
 * @param emailAddress - The email address to look up
 * @param provider - OAuth provider filter ('gmail', 'outlook', etc.)
 * @returns EmailRecord if found, null otherwise
 */
export async function findMonitoredEmail(
  emailAddress: string,
  provider: string
): Promise<EmailRecord | null> {
  // Always filter by provider to ensure we get the correct OAuth connection
  // This prevents ambiguity if a user has multiple providers for the same email
  const emailResult = await query(
    `SELECT me.id, me.business_id, me.email_address
     FROM monitored_emails me
     INNER JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address
     WHERE me.email_address = $1 AND ot.provider = $2`,
    [emailAddress, provider]
  );

  if (emailResult.rows.length === 0) {
    return null;
  }

  return emailResult.rows[0] as EmailRecord;
}

