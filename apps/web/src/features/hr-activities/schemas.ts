import { toFormikValidationSchema } from "zod-formik-adapter";
import { hrActivitiesSchema } from "@web/shared/schemas";

export const validationSchema = toFormikValidationSchema(hrActivitiesSchema);
