import { z } from "zod";

// Client-side login form schema
export const webAuthnLoginSchema = z.object({
  username: z.string().min(4, "Username should be at least 4 characters long"),
});

// Shared with server/apps/auth-service/src/validations/index.ts
export const webAuthnAuthenticationOptionsSchema = z.object({
  email: z.string().email("Valid email required"),
});

export const webAuthnRegistrationOptionsSchema = z.object({
  userId: z.string().min(1, "User ID required"),
  email: z.string().email("Valid email required").optional(),
});

export const webAuthnRegistrationVerifySchema = z.object({
  userId: z.string().min(1, "User ID required"),
  credential: z.string().min(1, "Credential required"),
});

export const webAuthnAuthenticationVerifySchema = z.object({
  userId: z.string().min(1, "User ID required"),
  credential: z.string().min(1, "Credential required"),
});

export type WebAuthnAuthenticationOptions = z.infer<
  typeof webAuthnAuthenticationOptionsSchema
>;
