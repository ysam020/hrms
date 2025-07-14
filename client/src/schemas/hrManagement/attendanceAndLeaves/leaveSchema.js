import * as Yup from "yup";

export const validationSchema = Yup.object({
  from: Yup.date()
    .required("From date is required")
    .min(
      new Date(new Date().setHours(0, 0, 0, 0)),
      "From date cannot be in the past"
    ), // Ensure 'from' is today's date at midnight
  to: Yup.date()
    .required("To date is required")
    .test(
      "is-greater",
      "To date must be the same or later than From date",
      function (value) {
        const { from } = this.parent; // Access the 'from' field value
        return value >= from; // Ensure 'to' is greater than or equal to 'from'
      }
    ),
  reason: Yup.string().required("Reason is required"),
  sick_leave: Yup.boolean(),
  medical_certificate: Yup.string().when("sick_leave", {
    is: true,
    then: (schema) => schema.required("Medical certificate is required"),
    otherwise: (schema) => schema.notRequired(),
  }),
});
