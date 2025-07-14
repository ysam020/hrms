import passport from "passport";
import { Strategy as CustomStrategy } from "passport-custom";
import User from "../model/userModel.mjs";
import bcrypt from "bcrypt";
import speakeasy from "speakeasy";
import logAuditTrail from "../utils/auditLogger.mjs";

passport.use(
  "custom-login",
  new CustomStrategy(async (req, done) => {
    const {
      username,
      password,
      twoFAToken,
      backupCode,
      useBackupCode,
      isTwoFactorEnabled,
    } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      try {
        await logAuditTrail({
          userId: null,
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
      } catch (logErr) {
        console.error(
          "Failed to log audit trail for unknown user:",
          logErr.message
        );
      }

      return done(null, false, { message: "User not found" });
    }

    // Capture geolocation from request (if available)
    const geolocation = req.body.geolocation || {
      latitude: null,
      longitude: null,
    };

    // Handle backup code login
    if (useBackupCode) {
      const codeIndex = user.backupCodes.findIndex(
        (encrypted) =>
          user.decryptField("backupCodes", encrypted) === backupCode
      );

      if (codeIndex === -1) {
        await logAuditTrail({
          userId: user._id,
          action: "LOGIN_FAILED",
          entityType: "authentication",
          oldData: null,
          newData: {
            reason: "Invalid backup code",
            ipAddress: req.ip,
            userAgent: req.body.userAgent,
            geolocation: geolocation,
          },
          description: `Failed login attempt for ${user.username} using backup code: Invalid backup code`,
          ipAddress: req.ip,
          userAgent: req.body.userAgent,
          geolocation: geolocation,
        });
        return done(null, false, { message: "Invalid backup code" });
      }

      // Backup code is valid → remove it
      user.backupCodes.splice(codeIndex, 1);
      await user.save();

      // Log successful login using backup code
      await logAuditTrail({
        userId: user._id,
        action: "LOGIN",
        entityType: "authentication",
        oldData: null,
        newData: {
          loginMethod: "Backup Code",
          sessionId: req.sessionID, // Session ID
          ipAddress: req.ip,
          userAgent: req.body.userAgent,
          geolocation: geolocation,
        },
        description: `User ${user.username} logged in successfully using Backup Code`,
        ipAddress: req.ip,
        userAgent: req.body.userAgent,
        geolocation: geolocation,
      });

      return done(null, user); // Login successful using backup code
    }

    // Username + Password login flow
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logAuditTrail({
        userId: user._id,
        action: "LOGIN_FAILED",
        entityType: "authentication",
        oldData: null,
        newData: {
          reason: "Invalid password",
          ipAddress: req.ip,
          userAgent: req.body.userAgent,
          geolocation: geolocation,
        },
        description: `Failed login attempt for ${user.username} using username/password: Invalid password`,
        ipAddress: req.ip,
        userAgent: req.body.userAgent,
        geolocation: geolocation,
      });
      return done(null, false, { message: "Invalid password" });
    }

    // Optional 2FA
    if (isTwoFactorEnabled && user.twoFactorSecret) {
      const isTokenValid = speakeasy.totp.verify({
        secret: user.decryptField("twoFactorSecret", user.twoFactorSecret),
        encoding: "base32",
        token: twoFAToken,
      });

      if (!isTokenValid) {
        await logAuditTrail({
          userId: user._id,
          action: "LOGIN_FAILED",
          entityType: "authentication",
          oldData: null,
          newData: {
            reason: "Invalid 2FA token",
            ipAddress: req.ip,
            userAgent: req.body.userAgent,
            geolocation: geolocation,
          },
          description: `Failed login attempt for ${user.username} using 2FA token: Invalid token`,
          ipAddress: req.ip,
          userAgent: req.body.userAgent,
          geolocation: geolocation,
        });
        return done(null, false, { message: "Invalid 2FA token" });
      }
    }

    // Log successful login using username/password or 2FA
    const loginMethod = useBackupCode
      ? "Backup Code"
      : isTwoFactorEnabled
      ? "2FA"
      : "Username/Password";

    await logAuditTrail({
      userId: user._id,
      action: "LOGIN",
      entityType: "authentication",
      oldData: null,
      newData: {
        loginMethod,
        sessionId: req.sessionID, // Session ID
        ipAddress: req.ip,
        userAgent: req.body.userAgent,
        geolocation: geolocation,
      },
      description: `User ${user.username} logged in successfully using ${loginMethod}`,
      ipAddress: req.ip,
      userAgent: req.body.userAgent,
      geolocation: geolocation,
    });

    return done(null, user); // All good
  })
);

// Serialize user (store user ID in session)
passport.serializeUser((user, done) => {
  done(null, user._id); // Or user.id
});

// Deserialize user (retrieve user from DB using the ID stored in session)
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});
