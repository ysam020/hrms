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
    unit: z.enum(["full_day", "half_day", "short_leave"]).default("full_day"),
    session: z.enum(["first_half", "second_half"]).optional(),
    shortLeaveHours: z.number().min(0.5).max(7).optional(),
  })
  .refine((data) => data.to >= data.from, {
    message: "To date must be the same or later than From date",
    path: ["to"],
  })
  .refine((data) => data.unit !== "half_day" || !!data.session, {
    message: "Choose which half of the day",
    path: ["session"],
  })
  .refine((data) => data.unit !== "short_leave" || !!data.shortLeaveHours, {
    message: "Enter how many hours",
    path: ["shortLeaveHours"],
  });

export type LeaveFormValues = z.infer<typeof leaveSchema>;
