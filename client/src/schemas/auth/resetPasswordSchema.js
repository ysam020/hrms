import * as Yup from "yup";

export const validationSchema = Yup.object({
  password: Yup.string().required("Current password is required"),
  new_password: Yup.string().required("New password is required"),
  confirm_password: Yup.string()
    .required("Please confirm your new password")
    .oneOf([Yup.ref("new_password"), null], "Passwords must match"),
});
