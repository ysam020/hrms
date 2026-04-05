import { z } from "zod";

export const leaveSchema = z
  .object({
    from: z.coerce
      .date()
      .refine(
        (d) => d >= new Date(new Date().setHours(0, 0, 0, 0)),
        "From date cannot be in the past",
      ),
    to: z.coerce.date(),
    reason: z.string().min(1, "Reason is required"),
    sick_leave: z.boolean().optional(),
  })
  .refine((data) => data.to >= data.from, {
    message: "To date must be the same or later than From date",
    path: ["to"],
  });

export type LeaveFormValues = z.infer<typeof leaveSchema>;
