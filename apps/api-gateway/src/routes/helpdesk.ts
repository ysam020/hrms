import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/helpdesk";
import {
  createTicketSchema,
  updateTicketSchema,
  addTicketCommentSchema,
} from "../schemas";

export const helpdeskRouter: Router = Router();

helpdeskRouter.get("/stats", authenticate, h.getHelpdeskStats);
helpdeskRouter.post(
  "/tickets",
  authenticate,
  validate(createTicketSchema),
  h.createTicket,
);
helpdeskRouter.get("/tickets", authenticate, h.listTickets);
helpdeskRouter.get("/tickets/:ticketId", authenticate, h.getTicket);
helpdeskRouter.patch(
  "/tickets/:ticketId",
  authenticate,
  validate(updateTicketSchema),
  h.updateTicket,
);
helpdeskRouter.post(
  "/tickets/:ticketId/comments",
  authenticate,
  validate(addTicketCommentSchema),
  h.addComment,
);
