import passport from "passport";
import { Strategy as WebAuthnStrategy } from "passport-custom";
import User from "../model/userModel.mjs";
import logAuditTrail from "../utils/auditLogger.mjs";

passport.use(
  "webauthn",
  new WebAuthnStrategy(async (req, done) => {
    try {
      const { username } = req.body;

      const user = await User.findOne({ username });

      if (!user) {
        await logAuditTrail({
          userId: username,
          action: "LOGIN_FAILED",
          entityType: "authentication",
          oldData: null,
          newData: {
            reason: "User not found",
            ipAddress: req.ip,
            userAgent: req.body.userAgent,
          },
          description: `Failed login attempt for ${username}: User not found`,
          ipAddress: req.ip,
          userAgent: req.body.userAgent,
        });

        return done(null, false, { message: "User not registered" });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  })
);
