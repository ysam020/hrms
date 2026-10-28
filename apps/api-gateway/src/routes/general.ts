import { Router } from "express";
import * as ru from "../handlers/resumableUpload";
import { authenticate, requirePrivileged } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { bulkDeleteHolidaysSchema } from "../schemas";
import * as h from "../handlers/general";

export const generalRouter: Router = Router();

generalRouter.get("/get-holidays/:year", authenticate, h.getHolidays);
generalRouter.get("/get-calendar-events", authenticate, h.getCalendarEvents);
generalRouter.get(
  "/birthdays-anniversaries",
  authenticate,
  h.getBirthdaysAnniversaries,
);
generalRouter.get(
  "/audit-logs",
  authenticate,
  requirePrivileged,
  h.getAuditLogs,
);
generalRouter.post("/add-holiday", authenticate, h.addHoliday);
generalRouter.put("/delete-holiday", authenticate, h.deleteHoliday);
generalRouter.put(
  "/bulk-delete-holidays",
  authenticate,
  validate(bulkDeleteHolidaysSchema),
  h.bulkDeleteHolidays,
);
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
// Resumable (S3 multipart) uploads — see handlers/resumableUpload.ts.
generalRouter.post(
  "/upload/multipart/start",
  authenticate,
  ru.startMultipartUpload,
);
generalRouter.post(
  "/upload/multipart/part-url",
  authenticate,
  ru.getPartUploadUrl,
);
generalRouter.get(
  "/upload/multipart/:uploadId/parts",
  authenticate,
  ru.listUploadedParts,
);
generalRouter.post(
  "/upload/multipart/complete",
  authenticate,
  ru.completeMultipartUpload,
);
generalRouter.post(
  "/upload/multipart/abort",
  authenticate,
  ru.abortMultipartUpload,
);
generalRouter.post("/upload/view-url", authenticate, h.getFileViewUrl);
