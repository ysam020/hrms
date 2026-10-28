import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const hrActivitiesSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(50, "Title cannot exceed 50 characters"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(200, "Description cannot exceed 200 characters"),
  date: z.coerce
    .date()
    .refine(
      (d) => d >= new Date(new Date().setHours(0, 0, 0, 0)),
      "Date cannot be in the past",
    ),
  time: z
    .string()
    .regex(timeRegex, "Invalid time format, use HH:mm (24-hour format)"),
});

export type HrActivitiesFormValues = z.infer<typeof hrActivitiesSchema>;
