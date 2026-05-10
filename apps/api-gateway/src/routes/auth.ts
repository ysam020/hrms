import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/auth";
import {
  webAuthnCredentialCheckSchema,
  webAuthnLoginOptionsSchema,
  webAuthnVerifyLoginSchema,
  webAuthnLoginSchema,
  disableWebAuthnSchema,
  webAuthnVerifyRegistrationSchema,
} from "../schemas";

export const authRouter: Router = Router();

authRouter.get("/profile", authenticate, h.getProfile);
authRouter.post("/refresh-token", h.refreshToken);
authRouter.get("/logout", authenticate, h.logout);

authRouter.get("/webauthn-register", authenticate, h.webAuthnRegisterOptions);
authRouter.get("/webauthn-credentials", authenticate, h.getWebAuthnCredentials);
authRouter.post(
  "/webauthn-credential-check",
  validate(webAuthnCredentialCheckSchema),
  h.webAuthnCredentialCheck,
);
authRouter.delete(
  "/disable-webauthn",
  authenticate,
  validate(disableWebAuthnSchema),
  h.disableWebAuthn,
);
authRouter.post("/webauthn-register", authenticate, h.webAuthnRegister);
authRouter.post(
  "/webauthn-verify-registration",
  authenticate,
  validate(webAuthnVerifyRegistrationSchema),
  h.webAuthnVerifyRegistration,
);
authRouter.post(
  "/webauthn-login-options",
  validate(webAuthnLoginOptionsSchema),
  h.webAuthnLoginOptions,
);
authRouter.post(
  "/webauthn-verify-login",
  validate(webAuthnVerifyLoginSchema),
  h.webAuthnVerifyLogin,
);
authRouter.post(
  "/webauthn-login",
  validate(webAuthnLoginSchema),
  h.webAuthnLogin,
);

authRouter.get("/auth/google", h.googleAuthRedirect);
authRouter.get("/auth/google/callback", h.googleAuthCallback);
