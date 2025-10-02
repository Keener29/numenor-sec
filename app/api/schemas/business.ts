import { z } from 'zod';

export const updateBusinessSchema = z.object({
  name: z.string().min(1, 'Business name is required').optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().url('Invalid website URL').optional(),
  memberCount: z.number().int().min(0, 'Member count must be non-negative').optional()
});

export const businessParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid business ID').transform(Number)
});

export type UpdateBusinessData = z.infer<typeof updateBusinessSchema>;
export type BusinessParams = z.infer<typeof businessParamsSchema>;
