import { z } from "zod";

export const feedbackSchema = z.object({
  manager_strengths: z.string().min(1, "Strengths is required"),
  manager_AreasOfImprovement: z
    .string()
    .min(1, "Areas of improvement is required"),
  feedback: z.string().min(1, "Feedback is required"),
});

export type FeedbackFormValues = z.infer<typeof feedbackSchema>;
