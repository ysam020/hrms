import { toFormikValidationSchema } from "zod-formik-adapter";
import { leaveSchema, attendanceCorrectionSchema } from "@web/shared/schemas";

export const leaveValidationSchema = toFormikValidationSchema(leaveSchema);
export const attendanceCorrectionValidationSchema = toFormikValidationSchema(
  attendanceCorrectionSchema,
);
export const validationSchema = leaveValidationSchema;
