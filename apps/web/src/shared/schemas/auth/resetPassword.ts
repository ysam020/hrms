import { z } from "zod";

export const resetPasswordSchema = z
  .object({
    password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(1, "New password is required"),
    confirm_password: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords must match",
    path: ["confirm_password"],
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
