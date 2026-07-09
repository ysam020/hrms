import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/payrollComponents";
import {
  createSalaryComponentSchema,
  updateSalaryComponentSchema,
  createPtSlabSchema,
  updatePtSlabSchema,
  createPayCycleSchema,
  updatePayCycleSchema,
} from "../schemas";

export const payrollComponentsRouter: Router = Router();

payrollComponentsRouter.get(
  "/salary-component-definitions",
  authenticate,
  h.listSalaryComponents,
);
payrollComponentsRouter.post(
  "/salary-component-definitions",
  authenticate,
  validate(createSalaryComponentSchema),
  h.createSalaryComponent,
);
payrollComponentsRouter.put(
  "/salary-component-definitions/:id",
  authenticate,
  validate(updateSalaryComponentSchema),
  h.updateSalaryComponent,
);
payrollComponentsRouter.delete(
  "/salary-component-definitions/:id",
  authenticate,
  h.deleteSalaryComponent,
);

payrollComponentsRouter.get("/pt-slabs", authenticate, h.listPtSlabs);
payrollComponentsRouter.post(
  "/pt-slabs",
  authenticate,
  validate(createPtSlabSchema),
  h.createPtSlab,
);
payrollComponentsRouter.put(
  "/pt-slabs/:id",
  authenticate,
  validate(updatePtSlabSchema),
  h.updatePtSlab,
);
payrollComponentsRouter.delete("/pt-slabs/:id", authenticate, h.deletePtSlab);

payrollComponentsRouter.get("/pay-cycles", authenticate, h.listPayCycles);
payrollComponentsRouter.post(
  "/pay-cycles",
  authenticate,
  validate(createPayCycleSchema),
  h.createPayCycle,
);
payrollComponentsRouter.put(
  "/pay-cycles/:id",
  authenticate,
  validate(updatePayCycleSchema),
  h.updatePayCycle,
);
payrollComponentsRouter.delete(
  "/pay-cycles/:id",
  authenticate,
  h.deletePayCycle,
);
