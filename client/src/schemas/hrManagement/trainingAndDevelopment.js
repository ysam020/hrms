import * as Yup from "yup";

export const validationSchema = Yup.object().shape({
  username: Yup.string().required("Username is required"),
  trainingProgram: Yup.string().required("Training program is required"),
  trainingDate: Yup.date()
    .required("Training date is required")
    .typeError("Please enter a valid date"),
  duration: Yup.string().required("Duration is required"),
  trainingProvider: Yup.string().required("Training provider is required"),
  feedback: Yup.string()
    .required("Feedback is required")
    .min(10, "Feedback must be at least 10 characters"),
});
