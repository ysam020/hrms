import * as Yup from "yup";

export const validationSchema = Yup.object({
  username: Yup.string()
    .required("Username is required")
    .min(4, "Username should be at least 4 characters long"),
});
