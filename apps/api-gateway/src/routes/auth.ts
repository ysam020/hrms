import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/auth";

export const authRouter: Router = Router();

authRouter.get("/profile", authenticate, h.getProfile);
authRouter.post("/refresh-token", h.refreshToken);
authRouter.post("/logout", authenticate, h.logout);

authRouter.get("/webauthn-register", authenticate, h.webAuthnRegisterOptions);
authRouter.get("/webauthn-credentials", authenticate, h.getWebAuthnCredentials);
authRouter.post("/webauthn-credential-check", h.webAuthnCredentialCheck);
authRouter.delete("/disable-webauthn", authenticate, h.disableWebAuthn);
authRouter.post("/webauthn-register", authenticate, h.webAuthnRegister);
authRouter.post(
  "/webauthn-verify-registration",
  authenticate,
  h.webAuthnVerifyRegistration,
);
authRouter.post("/webauthn-login-options", h.webAuthnLoginOptions);
authRouter.post("/webauthn-verify-login", h.webAuthnVerifyLogin);
authRouter.post("/webauthn-login", h.webAuthnLogin);

authRouter.get("/auth/google", h.googleAuthRedirect);
authRouter.get("/auth/google/callback", h.googleAuthCallback);
