import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const addEventSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    date: z
      .string()
      .regex(dateRegex, "Date must be in YYYY-MM-DD format")
      .refine((v) => {
        const selectedDate = new Date(v);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selectedDate >= today;
      }, "Date cannot be in the past"),
    startTime: z
      .string()
      .regex(timeRegex, "Start time must be in HH:MM format"),
    endTime: z.string().regex(timeRegex, "End time must be in HH:MM format"),
    description: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        const [startHour, startMinute] = data.startTime.split(":").map(Number);
        const [endHour, endMinute] = data.endTime.split(":").map(Number);
        if (
          endHour < startHour ||
          (endHour === startHour && endMinute <= startMinute)
        ) {
          return false;
        }
      }
      return true;
    },
    {
      message: "End time must be later than start time",
      path: ["endTime"],
    },
  );

export type AddEventFormValues = z.infer<typeof addEventSchema>;
