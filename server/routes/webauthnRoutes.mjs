import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import credentialCheck from "../controllers/webauthn/credentialCheck.mjs";
import disableWebAuthn from "../controllers/webauthn/disableWebAuthn.mjs";
import getCredentials from "../controllers/webauthn/getCredentials.mjs";
import initiateLogin from "../controllers/webauthn/initiateLogin.mjs";
import initiateRegistration from "../controllers/webauthn/initiateRegistration.mjs";
import verifyLogin from "../controllers/webauthn/verifyLogin.mjs";
import verifyRegistration from "../controllers/webauthn/verifyRegistration.mjs";
import webAuthnLogin from "../controllers/webauthn/webAuthnLogin.mjs";

const router = express.Router();

router.post("/api/webauthn-credential-check", credentialCheck);
router.get("/api/disable-webauthn", isAuthenticated, disableWebAuthn);
router.post("/api/get-credentials", getCredentials);
router.post("/api/webauthn-login-options", initiateLogin);
router.get("/api/webauthn-register", isAuthenticated, initiateRegistration);
router.post("/api/webauthn-verify-login", verifyLogin);
router.post(
  "/api/webauthn-verify-registration",
  isAuthenticated,
  verifyRegistration
);
router.post("/api/webauthn-login", webAuthnLogin);

export default router;
