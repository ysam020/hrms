import passport from "passport";
import { Strategy as WebAuthnStrategy } from "passport-custom";
import User from "../model/userModel.mjs";
import logAuditTrail from "../utils/auditLogger.mjs";

passport.use(
  "webauthn",
  new WebAuthnStrategy(async (req, done) => {
    try {
      const { username, credential } = req.body;

      if (!username || !credential) {
        return done(null, false, { message: "Missing username or credential" });
      }

      const user = await User.findOne({ username });
      if (!user) {
        return done(null, false, { message: "User not found" });
      }

      return done(null, user);
    } catch (error) {
      console.error(`Passport WebAuthn error:`, error);
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
