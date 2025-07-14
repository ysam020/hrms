import * as Yup from "yup";

export const validationSchema = Yup.object({
  first_name: Yup.string().required("This field is required"),
  last_name: Yup.string().required("This field is required"),
  email: Yup.string().required("This field is required"),
  employment_type: Yup.string().required("This field is required"),
});
