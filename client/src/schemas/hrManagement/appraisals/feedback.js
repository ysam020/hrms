import * as Yup from "yup";

export const validationSchema = Yup.object({
  manager_strengths: Yup.string().required("Strengths is required"),
  manager_AreasOfImprovement: Yup.string().required(
    "Areas of improvement is required"
  ),
  feedback: Yup.string().required("Feedback is required"),
});
