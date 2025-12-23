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
}).refine(
  (data) => {
    // If error is present, code/state validation is skipped (handled separately)
    // If no error, both code and state must be present (enforced by required fields above)
    return !data.error || (!!data.code && !!data.state);
  },
  {
    message: 'Both code and state parameters are required',
    path: ['code', 'state']
  }
);

