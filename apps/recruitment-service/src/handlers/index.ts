import { createJobOpening } from "./createJobOpening";
import { getJobOpening } from "./getJobOpening";
import { listJobOpenings } from "./listJobOpenings";
import { updateJobOpening } from "./updateJobOpening";
import { deleteJobOpening } from "./deleteJobOpening";
import { applyForJob } from "./applyForJob";
import { listApplications } from "./listApplications";
import { updateApplicationStatus } from "./updateApplicationStatus";
import { submitResignation } from "./submitResignation";
import { getResignation } from "./getResignation";
import { approveResignation } from "./approveResignation";
import { rejectResignation } from "./rejectResignation";
import { getMyResignation } from "./getMyResignation";
import { listResignations } from "./listResignations";

export const handlers = {
  CreateJobOpening: createJobOpening,
  GetJobOpening: getJobOpening,
  ListJobOpenings: listJobOpenings,
  UpdateJobOpening: updateJobOpening,
  DeleteJobOpening: deleteJobOpening,
  ApplyForJob: applyForJob,
  ListApplications: listApplications,
  UpdateApplicationStatus: updateApplicationStatus,
  SubmitResignation: submitResignation,
  GetResignation: getResignation,
  ApproveResignation: approveResignation,
  RejectResignation: rejectResignation,
  GetMyResignation: getMyResignation,
  ListResignations: listResignations,
};
