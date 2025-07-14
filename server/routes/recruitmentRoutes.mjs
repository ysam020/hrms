import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import addJobOpening from "../controllers/jobOpenings/addJobOpening.mjs";
import applyForJob from "../controllers/jobOpenings/applyForJob.mjs";
import getJobTitles from "../controllers/jobOpenings/getJobTitles.mjs";
import hireCandidate from "../controllers/jobOpenings/hireCandidate.mjs";
import rejectApplication from "../controllers/jobOpenings/rejectApplication.mjs";
import scheduleInterview from "../controllers/jobOpenings/scheduleInterview.mjs";
import rescheduleInterview from "../controllers/jobOpenings/rescheduleInterview.mjs";
import viewApplications from "../controllers/jobOpenings/viewApplications.mjs";
import viewJobOpening from "../controllers/jobOpenings/viewJobOpening.mjs";
import viewJobOpenings from "../controllers/jobOpenings/viewJobOpenings.mjs";
import updateCandidateStatus from "../controllers/jobOpenings/updateCandidateStatus.mjs";
import reassignInterviewer from "../controllers/jobOpenings/reassignInterviewer.mjs";
import submitCandidateFeedback from "../controllers/jobOpenings/submitCandidateFeedback.mjs";
import deleteJobOpening from "../controllers/jobOpenings/deleteJobOpening.mjs";
import editJobOpening from "../controllers/jobOpenings/editJobOpening.mjs";
import getInterviewerList from "../controllers/jobOpenings/getInterviewerList.mjs";

const router = express.Router();

router.post(
  "/api/add-job-opening",
  isAuthenticated,
  checkPermission("JobOpenings", "create_job_opening"),
  addJobOpening
);
router.post(
  "/api/edit-job-opening/:_id",
  isAuthenticated,
  checkPermission("JobOpenings", "edit_job_opening"),
  editJobOpening
);
router.post("/api/apply-for-job", applyForJob);
router.get("/api/get-job-titles", getJobTitles);
router.put(
  "/api/hire-candidate",
  isAuthenticated,
  checkPermission("JobOpenings", "hire_candidate"),
  hireCandidate
);
router.put(
  "/api/reject-application",
  isAuthenticated,
  checkPermission("JobOpenings", "reject_candidate"),
  rejectApplication
);
router.put(
  "/api/schedule-interview",
  isAuthenticated,
  checkPermission("JobOpenings", "schedule_interview"),
  scheduleInterview
);
router.put(
  "/api/reschedule-interview",
  isAuthenticated,
  checkPermission("JobOpenings", "schedule_interview"),
  rescheduleInterview
);
router.put(
  "/api/update-candidate-status",
  isAuthenticated,
  checkPermission("JobOpenings", "update_candidate_status"),
  updateCandidateStatus
);
router.put(
  "/api/submit-candidate-feedback",
  isAuthenticated,
  checkPermission("JobOpenings", "provide_feedback"),
  submitCandidateFeedback
);
router.put(
  "/api/reassign-interviewer",
  isAuthenticated,
  checkPermission("JobOpenings", "reassign_interviewer"),
  reassignInterviewer
);
router.get(
  "/api/view-applications/:id",
  isAuthenticated,
  checkPermission("JobOpenings", "view_applications"),
  viewApplications
);
router.get(
  "/api/view-job-opening/:id",
  isAuthenticated,
  checkPermission("JobOpenings", "view_job_openings"),
  viewJobOpening
);
router.get(
  "/api/view-job-openings",
  isAuthenticated,
  checkPermission("JobOpenings", "view_job_openings"),
  viewJobOpenings
);
router.delete(
  "/api/delete-job-opening/:_id",
  isAuthenticated,
  checkPermission("JobOpenings", "delete_job_opening"),
  deleteJobOpening
);
router.get("/api/get-interviewer-list", isAuthenticated, getInterviewerList);

export default router;
