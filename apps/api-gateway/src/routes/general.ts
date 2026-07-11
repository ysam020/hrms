import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/general";

export const generalRouter: Router = Router();

generalRouter.get("/get-holidays/:year", authenticate, h.getHolidays);
generalRouter.get("/get-calendar-events", authenticate, h.getCalendarEvents);
generalRouter.get(
  "/birthdays-anniversaries",
  authenticate,
  h.getBirthdaysAnniversaries,
);
generalRouter.get("/audit-logs", authenticate, h.getAuditLogs);
generalRouter.post("/add-holiday", authenticate, h.addHoliday);
generalRouter.put("/delete-holiday", authenticate, h.deleteHoliday);
generalRouter.post("/add-event", authenticate, h.addEvent);
generalRouter.put(
  "/edit-calendar-event/:_id",
  authenticate,
  h.editCalendarEvent,
);
generalRouter.delete(
  "/delete-calendar-event/:_id",
  authenticate,
  h.deleteCalendarEvent,
);
generalRouter.post("/upload/presigned-url", authenticate, h.getPresignedUrl);
generalRouter.post("/upload/view-url", authenticate, h.getFileViewUrl);
