/**
 * Validation Schemas using Zod
 * 
 * These schemas define validation rules for forms and API requests.
 * They ensure data integrity and provide user-friendly error messages.
 */

import { z } from 'zod';
import { Currency, OrderSide, OrderType } from '@/types/api';

// ============================================================================
// COMMON VALIDATORS
// ============================================================================

/**
 * Email validator
 */
export const emailSchema = z
  .string()
  .email('Please enter a valid email address')
  .min(1, 'Email is required');

/**
 * Password validator
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Two-factor code validator
 */
export const twoFactorCodeSchema = z
  .string()
  .length(6, 'Code must be 6 digits')
  .regex(/^[0-9]+$/, 'Code must contain only numbers');

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  twoFactorCode: twoFactorCodeSchema.optional(),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    displayName: z.string().min(2, 'Name must be at least 2 characters').optional(),
    agreedToTerms: z.boolean().refine((val) => val === true, {
      message: 'You must agree to the terms and conditions',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// ============================================================================
// TRADING SCHEMAS
// ============================================================================

export const orderFormSchema = z
  .object({
    pair: z.string().min(1, 'Trading pair is required'),
    side: z.enum(['BUY', 'SELL'] as const),
    type: z.enum(['MARKET', 'LIMIT', 'IOC'] as const),
    amount: z
      .string()
      .min(1, 'Amount is required')
      .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
        message: 'Amount must be a positive number',
      }),
    price: z
      .string()
      .refine((val) => val === '' || (!isNaN(parseFloat(val)) && parseFloat(val) > 0), {
        message: 'Price must be a positive number',
      })
      .optional(),
    timeInForce: z.enum(['GTC', 'IOC', 'FOK'] as const).optional(),
  })
  .refine(
    (data) => {
      // Price is required for LIMIT orders
      if (data.type === 'LIMIT') {
        return data.price && data.price.length > 0;
      }
      return true;
    },
    {
      message: 'Price is required for limit orders',
      path: ['price'],
    }
  );

export type OrderFormData = z.infer<typeof orderFormSchema>;

// ============================================================================
// WITHDRAWAL SCHEMAS
// ============================================================================

export const withdrawalSchema = z.object({
  walletId: z.string().min(1, 'Wallet is required'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: 'Amount must be a positive number',
    }),
  destination: z.string().min(1, 'Destination address is required'),
  tag: z.string().optional(),
  twoFactorCode: twoFactorCodeSchema.optional(),
});

export type WithdrawalFormData = z.infer<typeof withdrawalSchema>;

// ============================================================================
// DEPOSIT SCHEMAS
// ============================================================================

export const depositSchema = z.object({
  walletId: z.string().min(1, 'Wallet is required'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: 'Amount must be a positive number',
    }),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CARD', 'MOBILE_MONEY'] as const).optional(),
});

export type DepositFormData = z.infer<typeof depositSchema>;

// ============================================================================
// KYC SCHEMAS
// ============================================================================

export const kycPersonalInfoSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  dateOfBirth: z.string().refine(
    (date) => {
      const age = new Date().getFullYear() - new Date(date).getFullYear();
      return age >= 18;
    },
    { message: 'You must be at least 18 years old' }
  ),
  nationality: z.string().min(2, 'Nationality is required'),
});

export const kycAddressSchema = z.object({
  street: z.string().min(5, 'Street address must be at least 5 characters'),
  city: z.string().min(2, 'City is required'),
  state: z.string().optional(),
  postalCode: z.string().min(3, 'Postal code is required'),
  country: z.string().min(2, 'Country is required'),
});

export const kycDocumentSchema = z.object({
  type: z.enum(['ID_CARD', 'PASSPORT', 'DRIVERS_LICENSE', 'PROOF_OF_ADDRESS'] as const),
  documentNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  file: z.instanceof(File).refine((file) => file.size <= 5000000, {
    message: 'File size must be less than 5MB',
  }),
});

export type KYCPersonalInfoData = z.infer<typeof kycPersonalInfoSchema>;
export type KYCAddressData = z.infer<typeof kycAddressSchema>;
export type KYCDocumentData = z.infer<typeof kycDocumentSchema>;

// ============================================================================
// SETTINGS SCHEMAS
// ============================================================================

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters').optional(),
  phoneNumber: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number')
    .optional(),
});

export const apiKeySchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  permissions: z
    .array(z.enum(['READ', 'TRADE', 'WITHDRAW'] as const))
    .min(1, 'At least one permission is required'),
  ipWhitelist: z.array(z.string()).optional(),
  expiresAt: z.string().optional(),
});

export const withdrawalWhitelistSchema = z.object({
  currency: z.string().min(1, 'Currency is required'),
  address: z.string().min(10, 'Address is required'),
  tag: z.string().optional(),
  label: z.string().min(3, 'Label must be at least 3 characters'),
});

export type ChangePasswordData = z.infer<typeof changePasswordSchema>;
export type UpdateProfileData = z.infer<typeof updateProfileSchema>;
export type APIKeyData = z.infer<typeof apiKeySchema>;
export type WithdrawalWhitelistData = z.infer<typeof withdrawalWhitelistSchema>;
