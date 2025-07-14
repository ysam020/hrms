import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import completeKyc from "../controllers/employeeKyc/completeKyc.mjs";
import kycApproval from "../controllers/employeeKyc/kycApproval.mjs";
import viewAllKycs from "../controllers/employeeKyc/viewAllKycs.mjs";
import editKyc from "../controllers/employeeKyc/editKyc.mjs";

const router = express.Router();

router.post(
  "/api/complete-kyc",
  isAuthenticated,
  checkPermission("BasicKYCDetails", "fill_kyc_form"),
  completeKyc
);
router.post(
  "/api/kyc-approval",
  isAuthenticated,
  checkPermission("BasicKYCDetails", (req) =>
    req.body.kyc_approval === "Approved" ? "approve_kyc" : "reject_kyc"
  ),
  kycApproval
);
router.get(
  "/api/view-all-kycs",
  isAuthenticated,
  checkPermission("BasicKYCDetails", "view_kyc"),
  viewAllKycs
);
router.post(
  "/api/edit-kyc",
  isAuthenticated,
  checkPermission("BasicKYCDetails", "edit_kyc"),
  editKyc
);

export default router;
