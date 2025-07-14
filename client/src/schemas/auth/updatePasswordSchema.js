import * as Yup from "yup";

export const validationSchema = Yup.object({
  otp: Yup.string()
    .required("OTP is required")
    .length(6, "OTP must be exactly 6 digits"),
  password: Yup.string().required("Password is required"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password"), null], "Passwords must match")
    .required("Confirm Password is required"),
});
