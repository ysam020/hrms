import { z } from "zod";

export const hiringSchema = z.object({
  salary: z
    .number({ invalid_type_error: "Salary must be a number" })
    .int("Salary must be an integer"),
  joining_date: z.coerce.date({ required_error: "Joining date is required" }),
  reference_by: z.string().optional(),
});

export type HiringFormValues = z.infer<typeof hiringSchema>;
