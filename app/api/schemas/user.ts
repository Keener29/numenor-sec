import { z } from 'zod';
import { decodeHtmlEntities, stripHtmlTags } from '../utils/emailUtils';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  businessName: z.string().min(1, 'Business name is required')
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  businessName: z.string().min(1, 'Business name is required').optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential is required')
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email address is required')
});

// Schema for account deletion request body
export const deleteAccountSchema = z.object({
  reason: z
    .preprocess(
      (val) => (val === '' ? undefined : val), // Convert empty string to undefined
      z
        .string()
        .max(2000, 'Reason must be 2000 characters or less')
        .transform((val) => {
          // Sanitize: strip HTML tags and trim
          const sanitized = decodeHtmlEntities(stripHtmlTags(val)).trim();
          return sanitized || undefined; // Return undefined if empty after sanitization
        })
        .optional()
    )
});

export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type UpdateUserData = z.infer<typeof updateUserSchema>;
export type ChangePasswordData = z.infer<typeof changePasswordSchema>;
export type ResetPasswordData = z.infer<typeof resetPasswordSchema>;
export type DeleteAccountData = z.infer<typeof deleteAccountSchema>;
