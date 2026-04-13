import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/general";

export const generalRouter: Router = Router();

generalRouter.get("/holidays/:year", authenticate, h.getHolidays);
generalRouter.post(
  "/holidays",
  authenticate,
  h.validateAddHoliday,
  h.addHoliday,
);
generalRouter.delete(
  "/holidays",
  authenticate,
  h.validateDeleteHoliday,
  h.deleteHoliday,
);
generalRouter.get("/calendar-events", authenticate, h.getCalendarEvents);
generalRouter.post("/events", authenticate, h.validateAddEvent, h.addEvent);
generalRouter.put(
  "/events/:_id",
  authenticate,
  h.validateEditEvent,
  h.editCalendarEvent,
);
generalRouter.delete("/events/:_id", authenticate, h.deleteCalendarEvent);
generalRouter.get(
  "/birthdays-anniversaries",
  authenticate,
  h.getBirthdaysAnniversaries,
);
generalRouter.get("/audit-logs", authenticate, h.getAuditLogs);
generalRouter.post("/upload/presigned-url", authenticate, h.getPresignedUrl);
