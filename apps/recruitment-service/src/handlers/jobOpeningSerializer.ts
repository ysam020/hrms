import { recruitment } from "@hrms/proto";

/**
 * Maps a raw Prisma JobOpening row onto the exact proto `JobOpening` message
 * shape. `pipelineTemplateId`/`visibility`/`branchIds` were added to the
 * schema after several handlers were written, so those handlers never
 * populated them — for `branchIds` in particular, an undefined value
 * crashes the gRPC binary encoder's repeated-field writer ("not iterable").
 * Typed against the generated message (every field always set) rather than
 * a loose object, so a field renamed/removed in the .proto fails the build
 * instead of shipping silently.
 */
export function toJobOpeningProto(j: any): recruitment.JobOpening {
  return {
    id: j.id ?? "",
    jobTitle: j.jobTitle ?? "",
    numberOfVacancies: j.numberOfVacancies ?? 0,
    jobPostingDate: j.jobPostingDate ? j.jobPostingDate.toISOString() : "",
    applicationDeadline: j.applicationDeadline
      ? j.applicationDeadline.toISOString()
      : "",
    jobDescription: j.jobDescription || "",
    requiredSkills: j.requiredSkills || "",
    experience: j.experience ?? 0,
    budget: Array.isArray(j.budget) ? j.budget : [],
    department: j.department || "",
    hiringManager: j.hiringManager || "",
    candidatesHired: j.candidatesHired ?? 0,
    status: j.status || "",
    createdBy: j.createdBy || "",
    createdOn: j.createdOn ? j.createdOn.toISOString() : "",
    pipelineTemplateId: j.pipelineTemplateId || "",
    visibility: j.visibility || "external",
    branchIds: Array.isArray(j.branchIds) ? j.branchIds : [],
  };
}
