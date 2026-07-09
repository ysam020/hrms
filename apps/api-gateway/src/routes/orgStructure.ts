import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/orgStructure";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  createDesignationSchema,
  updateDesignationSchema,
} from "../schemas";

export const orgStructureRouter: Router = Router();

orgStructureRouter.get("/departments", authenticate, h.listDepartments);
orgStructureRouter.post(
  "/departments",
  authenticate,
  validate(createDepartmentSchema),
  h.createDepartment,
);
orgStructureRouter.put(
  "/departments/:id",
  authenticate,
  validate(updateDepartmentSchema),
  h.updateDepartment,
);
orgStructureRouter.delete("/departments/:id", authenticate, h.deleteDepartment);

orgStructureRouter.get("/designations", authenticate, h.listDesignations);
orgStructureRouter.post(
  "/designations",
  authenticate,
  validate(createDesignationSchema),
  h.createDesignation,
);
orgStructureRouter.put(
  "/designations/:id",
  authenticate,
  validate(updateDesignationSchema),
  h.updateDesignation,
);
orgStructureRouter.delete(
  "/designations/:id",
  authenticate,
  h.deleteDesignation,
);

orgStructureRouter.post(
  "/org-structure/migrate-from-free-text",
  authenticate,
  h.migrateFromFreeText,
);
