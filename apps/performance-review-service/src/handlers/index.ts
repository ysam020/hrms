import { createCycle } from "./createCycle";
import { listCycles } from "./listCycles";
import { getCycle } from "./getCycle";
import { updateCycle } from "./updateCycle";
import { updateCycleStatus } from "./updateCycleStatus";
import { submitSelfAssessment } from "./submitSelfAssessment";
import { submitManagerReview } from "./submitManagerReview";
import { getReview } from "./getReview";
import { listReviews } from "./listReviews";
import { finalizeReview } from "./finalizeReview";

export const handlers = {
  CreateCycle: createCycle,
  ListCycles: listCycles,
  GetCycle: getCycle,
  UpdateCycle: updateCycle,
  UpdateCycleStatus: updateCycleStatus,
  SubmitSelfAssessment: submitSelfAssessment,
  SubmitManagerReview: submitManagerReview,
  GetReview: getReview,
  ListReviews: listReviews,
  FinalizeReview: finalizeReview,
};
