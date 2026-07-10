import { z } from "zod";

export const hiringSchema = z.object({
  // The field is a text input (keyfilter: "int"), so formik always holds
  // this as a string — coerce it rather than requiring an actual number,
  // which rejected every valid value the user could ever type.
  salary: z.coerce
    .number({ invalid_type_error: "Salary must be a number" })
    .int("Salary must be an integer"),
  joining_date: z.coerce.date({ required_error: "Joining date is required" }),
  reference_by: z.string().optional(),
});

export type HiringFormValues = z.infer<typeof hiringSchema>;
