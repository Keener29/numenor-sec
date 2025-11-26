import { z } from 'zod';

// RFC 5321: Maximum email length is 320 characters (64 local + @ + 255 domain)
const MAX_EMAIL_LENGTH = 320;
const MAX_BULK_EMAILS = 5;

// Enhanced email validation function
const emailValidator = (email: string): boolean => {
  // Basic structure check
  if (email.length > MAX_EMAIL_LENGTH) return false;
  if (email.length < 3) return false; // Minimum: a@b
  
  // Check for dangerous characters that could be used for injection
  const dangerousChars = /[<>'"`\\\s]/;

  if (dangerousChars.test(email)) return false;
  
  // RFC 5322 compliant email regex (simplified but secure)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(email)) return false;
  
  // Additional checks
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  
  const [local, domain] = parts;
  
  // Local part validation (max 64 chars, no consecutive dots)
  if (local.length > 64 || local.length === 0) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  
  // Domain validation (max 255 chars)
  if (domain.length > 255 || domain.length === 0) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  
  // Domain must have at least one dot
  if (!domain.includes('.')) return false;
  
  return true;
};

// Custom Zod email refinement
const secureEmailRefinement = z.string()
  .min(3, 'Email address is too short')
  .max(MAX_EMAIL_LENGTH, `Email address exceeds maximum length of ${MAX_EMAIL_LENGTH} characters`)
  .refine((email) => {
    // Remove whitespace
    const trimmed = email.trim();
    if (trimmed !== email) return false;
    return emailValidator(trimmed);
  }, {
    message: 'Invalid email address format or contains invalid characters'
  })
  .transform((email) => email.toLowerCase().trim());

export const addEmailSchema = z.object({
  emailAddress: secureEmailRefinement
});

export const addBulkEmailsSchema = z.object({
  emailAddresses: z.array(secureEmailRefinement)
    .min(1, 'At least one email address is required')
    .max(MAX_BULK_EMAILS, `Maximum ${MAX_BULK_EMAILS} emails allowed per request`)
    .refine((emails) => {
      // Check for duplicates
      const unique = new Set(emails);
      return unique.size === emails.length;
    }, {
      message: 'Duplicate email addresses are not allowed'
    })
});

export const updateEmailSchema = z.object({
  emailAddress: secureEmailRefinement,
  isConnected: z.boolean().optional()
});

export const emailParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid email ID').transform(Number)
});

export const emailQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default("10"),
  connected: z.string().transform(val => val === 'true').optional()
});

export type AddEmailData = z.infer<typeof addEmailSchema>;
export type UpdateEmailData = z.infer<typeof updateEmailSchema>;
export type EmailParams = z.infer<typeof emailParamsSchema>;
export type EmailQuery = z.infer<typeof emailQuerySchema>;
