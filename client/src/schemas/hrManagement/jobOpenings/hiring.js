import * as Yup from "yup";

export const validationSchema = Yup.object({
  salary: Yup.number()
    .typeError("Salary must be a number")
    .integer("Salary must be an integer")
    .required("Salary is required"),
  joining_date: Yup.date().required("Joining date is required"),
  reference_by: Yup.string(),
});
