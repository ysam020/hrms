import { z } from "zod";

export const exitFeedbackSchema = z.object({
  overall_job_satisfaction: z
    .number()
    .min(1, "Please rate your job satisfaction from 1 to 5")
    .max(5, "Satisfaction rating cannot exceed 5"),
  quality_of_communication: z
    .string()
    .trim()
    .min(1, "Please provide feedback on communication quality"),
  support_from_manager: z
    .string()
    .trim()
    .min(1, "Please provide feedback on manager support"),
  appreciation_for_work: z
    .string()
    .trim()
    .min(1, "Please provide feedback on appreciation received"),
  collaboration_within_the_team: z
    .string()
    .trim()
    .min(1, "Please provide feedback on team collaboration"),
  overall_company_culture: z
    .string()
    .trim()
    .min(1, "Please provide feedback on company culture"),
  suggestions: z.string().trim().nullable().optional(),
});

export type ExitFeedbackFormValues = z.infer<typeof exitFeedbackSchema>;
