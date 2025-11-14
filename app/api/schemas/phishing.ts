import { z } from 'zod';

export const phishingStatisticsQuerySchema = z.object({
  days: z.string().regex(/^\d+$/).transform(Number).optional().default('30')
    .refine((val) => val > 0 && val <= 365, {
      message: 'Days must be between 1 and 365'
    })
});

export const phishingPatternsQuerySchema = z.object({
  // No query params currently, but schema ready for future use
}).passthrough();

