import * as Yup from "yup";

export const validationSchema = Yup.object({
  skill: Yup.string().required("This field is required"),
  company_policy_visited: Yup.string().required("This field is required"),
  introduction_with_md: Yup.string().required("This field is required"),
  employee_photo: Yup.string().required("This field is required"),
  resume: Yup.string().required("This field is required"),
  address_proof: Yup.string().required("This field is required"),
});
