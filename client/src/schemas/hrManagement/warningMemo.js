import * as Yup from "yup";

export const validationSchema = Yup.object({
  username: Yup.string().required("Username is required"),
  subject: Yup.string().required("Subject is required"),
  description: Yup.string().required("Description is required"),
});
