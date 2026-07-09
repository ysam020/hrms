import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { resolvePublicTenant } from "../middleware/resolvePublicTenant";
import * as h from "../handlers/recruitment";
import { submitResignationSchema } from "../schemas";

export const recruitmentRouter: Router = Router();

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
  requireSuperUser,
  h.editJobOpening,
);
recruitmentRouter.delete(
  "/delete-job-opening/:_id",
  authenticate,
  requireSuperUser,
  h.deleteJobOpening,
);
recruitmentRouter.get(
  "/public/careers/:slug",
  resolvePublicTenant,
  h.publicCareers,
);
recruitmentRouter.get("/get-job-titles", h.getJobTitles);
recruitmentRouter.post(
  "/apply-for-job/:slug",
  resolvePublicTenant,
  h.applyForJob,
);
recruitmentRouter.get(
  "/view-applications/:id",
  authenticate,
  requireSuperUser,
  h.viewApplications,
);
recruitmentRouter.put(
  "/update-candidate-status",
  authenticate,
  requireSuperUser,
  h.updateCandidateStatus,
);
recruitmentRouter.put(
  "/hire-candidate",
  authenticate,
  requireSuperUser,
  h.hireCandidate,
);
recruitmentRouter.put(
  "/reject-application",
  authenticate,
  requireSuperUser,
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
  h.jobOpeningsInsights,
);
recruitmentRouter.put(
  "/schedule-interview",
  authenticate,
  requireSuperUser,
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
  requireSuperUser,
  h.resignationInsights,
);
