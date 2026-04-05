import { toFormikValidationSchema } from "zod-formik-adapter";
import { exitFeedbackSchema } from "@web/shared/schemas";

export const validationSchema = toFormikValidationSchema(exitFeedbackSchema);
