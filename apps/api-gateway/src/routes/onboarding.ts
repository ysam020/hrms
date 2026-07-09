import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/onboarding";
import { updateOnboardingChecklistItemSchema } from "../schemas";

export const onboardingRouter: Router = Router();

onboardingRouter.get(
  "/onboarding-checklist",
  authenticate,
  h.getOnboardingChecklist,
);
onboardingRouter.put(
  "/onboarding-checklist/:stepKey",
  authenticate,
  validate(updateOnboardingChecklistItemSchema),
  h.updateOnboardingChecklistItem,
);
