import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import * as h from "../handlers/recruitment";

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
recruitmentRouter.get("/public/careers", h.publicCareers);
recruitmentRouter.get("/get-job-titles", h.getJobTitles);
recruitmentRouter.post("/apply-for-job", h.applyForJob);
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
recruitmentRouter.post("/add-resignation", authenticate, h.addResignation);
recruitmentRouter.get("/view-resignations", authenticate, h.viewResignations);
recruitmentRouter.put(
  "/approve-resignation/:_id",
  authenticate,
  requireSuperUser,
  h.approveResignation,
);
recruitmentRouter.put(
  "/reject-resignation/:_id",
  authenticate,
  requireSuperUser,
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
