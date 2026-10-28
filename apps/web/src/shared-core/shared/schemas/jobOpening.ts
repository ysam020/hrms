import { z } from "zod";

export const jobOpeningSchema = z
  .object({
    jobTitle: z
      .string()
      .trim()
      .min(2, "Job title must be at least 2 characters"),
    numberOfVacancies: z.coerce
      .number({ invalid_type_error: "Number of vacancies must be a number" })
      .int("Must be an integer")
      .positive("Must be greater than 0"),
    jobPostingDate: z.coerce
      .date()
      .refine((d) => d <= new Date(), "Posting date can't be in the future"),
    applicationDeadline: z.coerce.date(),
    jobDescription: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters"),
    requiredSkills: z.string().trim().min(2, "Enter at least one skill"),
    experience: z.string().trim().min(1, "Experience is required"),
    budget: z
      .tuple([z.number(), z.number()])
      .refine(([min, max]) => min < max, "Invalid budget range"),
    hiringManager: z.string().trim().min(1, "Hiring manager is required"),
    pipelineTemplateId: z.string().trim().optional(),
  })
  .refine((data) => data.applicationDeadline >= data.jobPostingDate, {
    message: "Deadline must be after the job posting date",
    path: ["applicationDeadline"],
  });

export type JobOpeningFormValues = z.infer<typeof jobOpeningSchema>;
