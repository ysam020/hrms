import { z } from "zod";

export const attendanceCorrectionSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

export type AttendanceCorrectionFormValues = z.infer<
  typeof attendanceCorrectionSchema
>;
