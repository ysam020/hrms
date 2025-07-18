// Updated server/config/passportWebAuthn.mjs
import passport from "passport";
import { Strategy as WebAuthnStrategy } from "passport-custom";
import User from "../model/userModel.mjs";
import logAuditTrail from "../utils/auditLogger.mjs";

passport.use(
  "webauthn",
  new WebAuthnStrategy(async (req, done) => {
    try {
      const { username, credential } = req.body;

      console.log(`🔐 PASSPORT WEBAUTHN STRATEGY for user: "${username}"`);

      if (!username || !credential) {
        return done(null, false, { message: "Missing username or credential" });
      }

      // ✅ Since verification already happened in /webauthn-verify-login,
      // we just need to find the user and proceed with login
      console.log(`✅ Skipping re-verification (already verified)`);

      const user = await User.findOne({ username });
      if (!user) {
        return done(null, false, { message: "User not found" });
      }

      console.log(
        `✅ Passport WebAuthn authentication successful for: "${username}"`
      );
      return done(null, user);
    } catch (error) {
      console.error(`❌ Passport WebAuthn error:`, error);
      await logAuditTrail({
        userId: req.body.username,
        action: "LOGIN_FAILED",
        entityType: "authentication",
        oldData: null,
        newData: {
          reason: error.message,
          ipAddress: req.ip,
          userAgent: req.body.userAgent,
        },
        description: `WebAuthn login error for ${req.body.username}: ${error.message}`,
        ipAddress: req.ip,
        userAgent: req.body.userAgent,
      });
      return done(error);
    }
  })
);
