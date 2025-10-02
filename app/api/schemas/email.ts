import { z } from 'zod';

export const addEmailSchema = z.object({
  emailAddress: z.string().email('Invalid email address')
});

export const updateEmailSchema = z.object({
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
