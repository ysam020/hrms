import { z } from "zod";

export const appraisalSchema = z.object({
  score: z.number().min(1, "Minimum score is 1").max(5, "Maximum score is 5"),
  strengths: z.string().min(5, "Strengths must be at least 5 characters long"),
  areasOfImprovement: z
    .string()
    .min(5, "Areas of improvement must be at least 5 characters long"),
});

export type AppraisalFormValues = z.infer<typeof appraisalSchema>;
