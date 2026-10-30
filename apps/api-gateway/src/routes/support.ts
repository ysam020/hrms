import { Router } from "express";
import { validate } from "../middleware/validate";
import * as h from "../handlers/support";
import * as p from "../handlers/platformSupport";
import {
  createSupportTicketSchema,
  supportReplySchema,
  supportReopenSchema,
  supportUploadSchema,
  platformSupportReplySchema,
  platformSupportUpdateSchema,
  platformSupportDuplicateSchema,
} from "../schemas";

// Organisation → Praesto support. Mounted at /support behind authenticate +
// requireTenant (routes/index.ts), deliberately without the subscription
// guard so a lapsed organisation can still reach billing support.
export const supportRouter: Router = Router();

supportRouter.get("/context", h.getSupportContext);
supportRouter.get("/stats", h.getSupportStats);
supportRouter.get("/tickets", h.listSupportTickets);
supportRouter.post(
  "/tickets",
  validate(createSupportTicketSchema),
  h.createSupportTicket,
);
supportRouter.get("/tickets/:ticketId", h.getSupportTicket);
supportRouter.post(
  "/tickets/:ticketId/replies",
  validate(supportReplySchema),
  h.replyToSupportTicket,
);
supportRouter.post(
  "/tickets/:ticketId/reopen",
  validate(supportReopenSchema),
  h.reopenSupportTicket,
);
supportRouter.post("/tickets/:ticketId/close", h.closeSupportTicket);
supportRouter.post(
  "/attachments",
  validate(supportUploadSchema),
  h.createSupportUpload,
);
supportRouter.post(
  "/attachments/:attachmentId/complete",
  h.completeSupportUpload,
);
supportRouter.get("/attachments/:attachmentId/url", h.getSupportAttachmentUrl);

// The Praesto support team's console. Mounted at /platform/support behind
// authenticate + requireSupportAgent — a platform grant no tenant role gives.
export const platformSupportRouter: Router = Router();

platformSupportRouter.get("/stats", p.getPlatformSupportStats);
platformSupportRouter.get("/agents", p.listSupportAgents);
platformSupportRouter.get("/tickets", p.listPlatformSupportTickets);
platformSupportRouter.get("/tickets/:ticketId", p.getPlatformSupportTicket);
platformSupportRouter.patch(
  "/tickets/:ticketId",
  validate(platformSupportUpdateSchema),
  p.updateTicketAsAgent,
);
platformSupportRouter.post(
  "/tickets/:ticketId/replies",
  validate(platformSupportReplySchema),
  p.replyAsAgent,
);
platformSupportRouter.post(
  "/tickets/:ticketId/duplicate",
  validate(platformSupportDuplicateSchema),
  p.markDuplicate,
);
platformSupportRouter.post(
  "/attachments",
  validate(supportUploadSchema),
  p.createAgentUpload,
);
platformSupportRouter.post(
  "/attachments/:attachmentId/complete",
  p.completeAgentUpload,
);
platformSupportRouter.get(
  "/attachments/:attachmentId/url",
  p.getAgentAttachmentUrl,
);
