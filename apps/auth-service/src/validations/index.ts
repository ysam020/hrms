import { z } from "zod";

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token required"),
});

export const logoutSchema = z.object({
  userId: z.string().min(1, "User ID required"),
});

export const getProfileSchema = z.object({
  userId: z.string().min(1, "User ID required"),
});

export const webAuthnRegistrationOptionsSchema = z.object({
  userId: z.string().min(1, "User ID required"),
  email: z.string().email("Valid email required").optional(),
});

export const webAuthnRegistrationVerifySchema = z.object({
  userId: z.string().min(1, "User ID required"),
  credential: z.string().min(1, "Credential required"),
});

export const webAuthnAuthenticationOptionsSchema = z.object({
  email: z.string().email("Valid email required"),
});

export const webAuthnAuthenticationVerifySchema = z.object({
  userId: z.string().min(1, "User ID required"),
  credential: z.string().min(1, "Credential required"),
});
