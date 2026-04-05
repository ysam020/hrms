import { z } from "zod";

export const rejectApplicationSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

export type RejectApplicationFormValues = z.infer<
  typeof rejectApplicationSchema
>;
