import * as Yup from "yup";

export const validationSchema = Yup.object({
  title: Yup.string().required("Title is required"),
  date: Yup.string()
    .required("Date is required")
    .matches(
      /^\d{4}-\d{2}-\d{2}$/, // Matches the YYYY-MM-DD format
      "Date must be in YYYY-MM-DD format"
    )
    .test("not-in-past", "Date cannot be in the past", (value) => {
      const selectedDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set today's time to 00:00:00 for comparison
      return selectedDate >= today; // Ensure selected date is not before today
    }),
  startTime: Yup.string()
    .required("Start Time is required")
    .matches(
      /^([01]\d|2[0-3]):([0-5]\d)$/, // Matches the HH:MM format (24-hour time)
      "Start time must be in HH:MM format"
    ),
  endTime: Yup.string()
    .required("End Time is required")
    .matches(
      /^([01]\d|2[0-3]):([0-5]\d)$/, // Matches the HH:MM format (24-hour time)
      "End time must be in HH:MM format"
    )
    .test(
      "is-later",
      "End time must be later than start time",
      function (value) {
        const { startTime } = this.parent;
        if (startTime && value) {
          const [startHour, startMinute] = startTime.split(":").map(Number);
          const [endHour, endMinute] = value.split(":").map(Number);
          if (
            endHour < startHour ||
            (endHour === startHour && endMinute <= startMinute)
          ) {
            return false; // End time must be later than start time
          }
        }
        return true;
      }
    ),
  description: Yup.string(),
});
