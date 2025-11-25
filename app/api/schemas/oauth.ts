import { z } from 'zod';

export const oauthAuthUrlSchema = z.object({
  emailAddress: z.string().email('Valid email address is required'),
  businessId: z.string().regex(/^\d+$/).transform(Number).optional(),
  approveToken: z.string().optional()
});

export const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional()
});

