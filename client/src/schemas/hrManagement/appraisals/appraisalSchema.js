import * as Yup from "yup";

export const validationSchema = Yup.object({
  score: Yup.number()
    .required("Performance score is required")
    .min(1, "Minimum score is 1")
    .max(5, "Maximum score is 5"),
  strengths: Yup.string()
    .required("Strengths are required")
    .min(5, "Strengths must be at least 5 characters long"),
  areasOfImprovement: Yup.string()
    .required("Areas of improvement are required")
    .min(5, "Areas of improvement must be at least 5 characters long"),
});
