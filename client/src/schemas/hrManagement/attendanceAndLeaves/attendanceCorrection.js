import * as Yup from "yup";

export const validationSchema = Yup.object({
  username: Yup.string().required("Username is required"),
});
