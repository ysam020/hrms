import * as Yup from "yup";

export const validationSchema = Yup.object({
  reason: Yup.string().required("Reason is required"),
});
