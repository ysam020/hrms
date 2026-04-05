import { toFormikValidationSchema } from "zod-formik-adapter";
import { employeeManagementSchema } from "@web/shared/schemas";

export const validationSchema = toFormikValidationSchema(
  employeeManagementSchema,
);
