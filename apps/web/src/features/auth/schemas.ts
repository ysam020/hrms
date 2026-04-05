import { toFormikValidationSchema } from "zod-formik-adapter";
import { webAuthnLoginSchema } from "@web/shared/schemas";

export const validationSchema = toFormikValidationSchema(webAuthnLoginSchema);
