import { toFormikValidationSchema } from "zod-formik-adapter";
import { addEventSchema } from "@web/shared/schemas";

export const validationSchema = toFormikValidationSchema(addEventSchema);
