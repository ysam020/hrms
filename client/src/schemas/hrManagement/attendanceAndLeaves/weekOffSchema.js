import * as Yup from "yup";

export const validationSchema = Yup.object({
  date: Yup.date()
    .required("Date is required")
    .min(
      new Date(new Date().setHours(0, 0, 0, 0)),
      "From date cannot be in the past"
    ), // Ensure 'from' is today's date at midnight
});
