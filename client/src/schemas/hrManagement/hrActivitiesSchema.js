import * as Yup from "yup";

export const validationSchema = Yup.object({
  title: Yup.string()
    .min(3, "Title must be at least 3 characters")
    .max(50, "Title cannot exceed 50 characters")
    .required("Title is required"),
  description: Yup.string()
    .min(10, "Description must be at least 10 characters")
    .max(200, "Description cannot exceed 200 characters")
    .required("Description is required"),
  date: Yup.date()
    .min(new Date().toISOString().split("T")[0], "Date cannot be in the past")
    .required("Date is required"),
  time: Yup.string()
    .matches(
      /^([01]\d|2[0-3]):([0-5]\d)$/,
      "Invalid time format, use HH:mm (24-hour format)"
    )
    .required("Time is required"),
});
