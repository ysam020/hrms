import * as Yup from "yup";

export const validationSchema = Yup.object({
  timeIn: Yup.string().required("Time in is required"),
});
