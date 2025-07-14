import * as Yup from "yup";

export const validationSchema = Yup.object().shape({
  jobTitle: Yup.string()
    .trim()
    .required("Job title is required")
    .min(2, "Job title must be at least 2 characters"),

  numberOfVacancies: Yup.number()
    .typeError("Number of vacancies must be a number")
    .required("Number of vacancies is required")
    .positive("Must be greater than 0")
    .integer("Must be an integer"),

  jobPostingDate: Yup.date()
    .required("Job posting date is required")
    .max(new Date(), "Posting date can't be in the future"),

  applicationDeadline: Yup.date()
    .required("Application deadline is required")
    .min(
      Yup.ref("jobPostingDate"),
      "Deadline must be after the job posting date"
    ),

  jobDescription: Yup.string()
    .trim()
    .required("Job description is required")
    .min(10, "Description must be at least 10 characters"),

  requiredSkills: Yup.string()
    .trim()
    .required("Required skills are required")
    .min(2, "Enter at least one skill"),

  experience: Yup.string().trim().required("Experience is required"),

  location: Yup.string().trim().required("Location is required"),

  budget: Yup.array()
    .of(Yup.number().required())
    .length(2, "Budget should be a range with two values")
    .test("is-budget-valid", "Invalid budget range", (val) =>
      val?.length === 2 ? val[0] < val[1] : false
    ),

  hiringManager: Yup.string().trim().required("Hiring manager is required"),
});
