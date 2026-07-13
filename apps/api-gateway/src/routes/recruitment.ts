import { Router } from "express";
import {
  authenticate,
  requireSuperUser,
  requirePrivileged,
  requireHrPrivileged,
} from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { resolvePublicTenant } from "../middleware/resolvePublicTenant";
import * as h from "../handlers/recruitment";
import { submitResignationSchema } from "../schemas";

export const recruitmentRouter: Router = Router();

// Genuinely anonymous routes — a candidate has no JWT, so these must NOT
// sit behind the authenticated recruitmentRouter (see publicRecruitmentRouter
// below, mounted without the authenticate/requireTenant/subscription guard).
export const publicRecruitmentRouter: Router = Router();
publicRecruitmentRouter.get(
  "/public/careers/:slug",
  resolvePublicTenant,
  h.publicCareers,
);
publicRecruitmentRouter.get(
  "/public/careers/:slug/job/:id",
  resolvePublicTenant,
  h.publicJobOpening,
);
publicRecruitmentRouter.post(
  "/apply-for-job/:slug",
  resolvePublicTenant,
  h.applyForJob,
);

recruitmentRouter.get("/view-job-openings", authenticate, h.viewJobOpenings);
recruitmentRouter.get("/view-job-opening/:id", authenticate, h.viewJobOpening);
recruitmentRouter.post(
  "/add-job-opening",
  authenticate,
  requireSuperUser,
  h.addJobOpening,
);
recruitmentRouter.put(
  "/edit-job-opening/:_id",
  authenticate,
  requirePrivileged,
  h.editJobOpening,
);
recruitmentRouter.delete(
  "/delete-job-opening/:_id",
  authenticate,
  requirePrivileged,
  h.deleteJobOpening,
);
recruitmentRouter.get("/get-job-titles", h.getJobTitles);
recruitmentRouter.get(
  "/view-applications/:id",
  authenticate,
  requirePrivileged,
  h.viewApplications,
);
recruitmentRouter.put(
  "/update-candidate-status",
  authenticate,
  requirePrivileged,
  h.updateCandidateStatus,
);
recruitmentRouter.put(
  "/hire-candidate",
  authenticate,
  requirePrivileged,
  h.hireCandidate,
);
recruitmentRouter.put(
  "/reject-application",
  authenticate,
  requirePrivileged,
  h.rejectApplication,
);
recruitmentRouter.post(
  "/add-resignation",
  authenticate,
  validate(submitResignationSchema),
  h.addResignation,
);
recruitmentRouter.get("/my-resignation", authenticate, h.getMyResignation);
recruitmentRouter.get("/view-resignations", authenticate, h.viewResignations);
// No requireSuperUser guard: the Approval Chain resolves who may act (the
// requester's reporting manager by default, or an owner/admin/superuser
// override) — see actOnApprovalForEntity in handlers/approvalChains.ts.
recruitmentRouter.put(
  "/approve-resignation/:_id",
  authenticate,
  h.approveResignation,
);
recruitmentRouter.put(
  "/reject-resignation/:_id",
  authenticate,
  h.rejectResignation,
);
recruitmentRouter.put(
  "/withdraw-resignation/:_id",
  authenticate,
  h.withdrawResignation,
);
recruitmentRouter.get(
  "/job-openings-insights",
  authenticate,
  requireHrPrivileged,
  h.jobOpeningsInsights,
);
recruitmentRouter.put(
  "/schedule-interview",
  authenticate,
  requirePrivileged,
  h.scheduleInterview,
);
recruitmentRouter.put(
  "/reschedule-interview",
  authenticate,
  requireSuperUser,
  h.rescheduleInterview,
);
recruitmentRouter.put(
  "/reassign-interviewer",
  authenticate,
  requireSuperUser,
  h.reassignInterviewer,
);
recruitmentRouter.get(
  "/get-interviewer-list",
  authenticate,
  h.getInterviewerList,
);
recruitmentRouter.put(
  "/update-resignation/:_id",
  authenticate,
  requireSuperUser,
  h.updateResignation,
);
recruitmentRouter.post("/add-exit-feedback", authenticate, h.addExitFeedback);
recruitmentRouter.get(
  "/resignation-insights",
  authenticate,
  requireHrPrivileged,
  h.resignationInsights,
);
