import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/shifts";
import {
  createShiftSchema,
  updateShiftSchema,
  assignShiftSchema,
} from "../schemas";

export const shiftsRouter: Router = Router();

shiftsRouter.get("/shifts", authenticate, h.listShifts);
shiftsRouter.post(
  "/shifts",
  authenticate,
  validate(createShiftSchema),
  h.createShift,
);
shiftsRouter.put(
  "/shifts/:id",
  authenticate,
  validate(updateShiftSchema),
  h.updateShift,
);
shiftsRouter.delete("/shifts/:id", authenticate, h.deleteShift);
shiftsRouter.put(
  "/shifts/:id/assign",
  authenticate,
  validate(assignShiftSchema),
  h.assignShift,
);
