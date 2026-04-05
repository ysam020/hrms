import { toFormikValidationSchema } from "zod-formik-adapter";
import {
  hiringSchema,
  jobOpeningSchema,
  rejectApplicationSchema,
} from "@web/shared/schemas";

export const hiringValidationSchema = toFormikValidationSchema(hiringSchema);
export const jobOpeningValidationSchema =
  toFormikValidationSchema(jobOpeningSchema);
export const rejectApplicationValidationSchema = toFormikValidationSchema(
  rejectApplicationSchema,
);
export const validationSchema = jobOpeningValidationSchema;
