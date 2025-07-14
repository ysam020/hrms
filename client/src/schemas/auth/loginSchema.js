import * as Yup from "yup";

export const validationSchema = (isTwoFactorEnabled, useBackupCode) =>
  Yup.object({
    password: !useBackupCode
      ? Yup.string().required("Password is required")
      : Yup.string().notRequired(),
    twoFAToken:
      isTwoFactorEnabled && !useBackupCode
        ? Yup.string().required("2FA token is required")
        : Yup.string().notRequired(), // Not required when using backup code
    backupCode: useBackupCode
      ? Yup.string()
          .required("Backup code is required")
          .length(8, "Backup code must be exactly 8 characters long")
      : Yup.string().notRequired(),
  });
