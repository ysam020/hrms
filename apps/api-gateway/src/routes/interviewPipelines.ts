import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as pipelines from "../handlers/interviewPipelines";
import * as stages from "../handlers/applicationStages";
import {
  createInterviewPipelineTemplateSchema,
  updateInterviewPipelineTemplateSchema,
  advanceApplicationStageSchema,
  bulkAdvanceStageSchema,
  createOfferSchema,
  updateOfferStatusSchema,
} from "../schemas";

export const interviewPipelinesRouter: Router = Router();

interviewPipelinesRouter.get(
  "/interview-pipeline-templates",
  authenticate,
  pipelines.listInterviewPipelineTemplates,
);
interviewPipelinesRouter.post(
  "/interview-pipeline-templates",
  authenticate,
  validate(createInterviewPipelineTemplateSchema),
  pipelines.createInterviewPipelineTemplate,
);
interviewPipelinesRouter.put(
  "/interview-pipeline-templates/:id",
  authenticate,
  validate(updateInterviewPipelineTemplateSchema),
  pipelines.updateInterviewPipelineTemplate,
);
interviewPipelinesRouter.delete(
  "/interview-pipeline-templates/:id",
  authenticate,
  pipelines.deleteInterviewPipelineTemplate,
);

interviewPipelinesRouter.put(
  "/applications/:id/advance-stage",
  authenticate,
  validate(advanceApplicationStageSchema),
  stages.advanceApplicationStage,
);
interviewPipelinesRouter.get(
  "/applications/:id/stage-events",
  authenticate,
  stages.listApplicationStageEvents,
);
interviewPipelinesRouter.post(
  "/applications/bulk-advance-stage",
  authenticate,
  validate(bulkAdvanceStageSchema),
  stages.bulkAdvanceStage,
);

interviewPipelinesRouter.get(
  "/applications/:id/offers",
  authenticate,
  stages.listOffers,
);
interviewPipelinesRouter.post(
  "/applications/:id/offers",
  authenticate,
  validate(createOfferSchema),
  stages.createOffer,
);
interviewPipelinesRouter.put(
  "/offers/:id/status",
  authenticate,
  validate(updateOfferStatusSchema),
  stages.updateOfferStatus,
);
