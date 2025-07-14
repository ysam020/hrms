import * as Yup from "yup";

export const validationSchema = Yup.object().shape({
  overall_job_satisfaction: Yup.number()
    .min(1, "Please rate your job satisfaction from 1 to 5")
    .max(5, "Satisfaction rating cannot exceed 5")
    .required("Overall job satisfaction is required"),

  quality_of_communication: Yup.string()
    .trim()
    .required("Please provide feedback on communication quality"),

  support_from_manager: Yup.string()
    .trim()
    .required("Please provide feedback on manager support"),

  appreciation_for_work: Yup.string()
    .trim()
    .required("Please provide feedback on appreciation received"),

  collaboration_within_the_team: Yup.string()
    .trim()
    .required("Please provide feedback on team collaboration"),

  overall_company_culture: Yup.string()
    .trim()
    .required("Please provide feedback on company culture"),

  suggestions: Yup.string().trim().nullable(), // optional, remove if required
});
