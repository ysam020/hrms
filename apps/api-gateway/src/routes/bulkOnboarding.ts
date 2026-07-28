import { Router } from "express";
import { authenticate, requireHrPrivileged } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/onboardingImport";
import {
  bulkOnboardingUploadUrlSchema,
  bulkOnboardingKeySchema,
} from "../schemas";

export const bulkOnboardingRouter: Router = Router();

bulkOnboardingRouter.get(
  "/bulk-onboarding/template",
  authenticate,
  requireHrPrivileged,
  h.downloadOnboardingTemplate,
);
bulkOnboardingRouter.post(
  "/bulk-onboarding/upload-url",
  authenticate,
  requireHrPrivileged,
  validate(bulkOnboardingUploadUrlSchema),
  h.getOnboardingImportUploadUrl,
);
bulkOnboardingRouter.post(
  "/bulk-onboarding/validate",
  authenticate,
  requireHrPrivileged,
  validate(bulkOnboardingKeySchema),
  h.validateOnboardingImport,
);
bulkOnboardingRouter.post(
  "/bulk-onboarding/commit",
  authenticate,
  requireHrPrivileged,
  validate(bulkOnboardingKeySchema),
  h.commitOnboardingImport,
);
