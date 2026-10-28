import { z } from "zod";

export const hiringSchema = z.object({
  // Drives redistribution across the salary component rows — the actual
  // per-component amounts (not this single number) are what gets sent to
  // the backend, but a positive gross is required before any components
  // can be meaningfully split.
  grossSalary: z.coerce
    .number({ invalid_type_error: "Salary must be a number" })
    .positive("Monthly gross salary must be greater than 0"),
  components: z.record(z.string(), z.number()).optional(),
  joining_date: z.coerce.date({ required_error: "Joining date is required" }),
  reference_by: z.string().optional(),
});

export type HiringFormValues = z.infer<typeof hiringSchema>;
