import { z } from 'zod';

export const updateAlertSchema = z.object({
  status: z.enum(['pending', 'reviewed', 'safe', 'threat']).optional(),
  description: z.string().optional()
});

export const alertParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid alert ID').transform(Number)
});

export const alertQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default(10),
  status: z.enum(['pending', 'reviewed', 'safe', 'threat']).optional(),
  threatLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  emailId: z.string().regex(/^\d+$/).transform(Number).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

export const createAlertSchema = z.object({
  emailId: z.number().int().positive('Invalid email ID'),
  subject: z.string().min(1, 'Subject is required'),
  senderEmail: z.string().email('Invalid sender email'),
  recipientEmail: z.string().email('Invalid recipient email'),
  threatLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  alertType: z.string().min(1, 'Alert type is required'),
  description: z.string().optional(),
  rawEmailData: z.record(z.any()).optional()
});

export type UpdateAlertData = z.infer<typeof updateAlertSchema>;
export type AlertParams = z.infer<typeof alertParamsSchema>;
export type AlertQuery = z.infer<typeof alertQuerySchema>;
export type CreateAlertData = z.infer<typeof createAlertSchema>;
