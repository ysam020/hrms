import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import addStickyNote from "../controllers/user/addStickyNote.mjs";
import getStickyNote from "../controllers/user/getStickyNote.mjs";
import addEvent from "../controllers/user/addEvent.mjs";
import getCalendarEvents from "../controllers/user/getCalendarEvents.mjs";
import deleteCalendarEvent from "../controllers/user/deleteCalendarEvent.mjs";
import getUserData from "../controllers/user/getUserData.mjs";

const router = express.Router();

router.post("/api/add-sticky-note", isAuthenticated, addStickyNote);
router.get("/api/get-sticky-note", isAuthenticated, getStickyNote);
router.post("/api/add-event", isAuthenticated, addEvent);
router.get("/api/get-calendar-events", isAuthenticated, getCalendarEvents);
router.delete(
  "/api/delete-calendar-event/:_id",
  isAuthenticated,
  deleteCalendarEvent
);
router.get("/api/get-user-data/:username", isAuthenticated, getUserData);

export default router;
