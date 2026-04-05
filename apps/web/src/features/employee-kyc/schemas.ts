import { toFormikValidationSchema } from "zod-formik-adapter";
import { kycSchema } from "@web/shared/schemas";

export const validationSchema = toFormikValidationSchema(kycSchema);
