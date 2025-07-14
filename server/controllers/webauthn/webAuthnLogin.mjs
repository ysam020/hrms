/**
 * @swagger
 * /api/auth/webauthn-login:
 *   post:
 *     summary: Authenticate user using WebAuthn
 *     description: Authenticates a user using WebAuthn, creates a session, and stores geolocation and user agent details. Requires WebAuthn-enabled credentials.
 *     security:
 *       - SessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               geolocation:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     example: 23.0225
 *                   longitude:
 *                     type: number
 *                     example: 72.5714
 *               userAgent:
 *                 type: string
 *                 example: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
 *     responses:
 *       200:
 *         description: Login successful, session stored.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 user:
 *                   type: object
 *                   properties:
 *                     username:
 *                       type: string
 *                       example: "john_doe"
 *                     rank:
 *                       type: integer
 *                       example: 3
 *                     firstName:
 *                       type: string
 *                       example: "John"
 *                     middleName:
 *                       type: string
 *                       example: "A."
 *                     lastName:
 *                       type: string
 *                       example: "Doe"
 *                     employeePhoto:
 *                       type: string
 *                       example: "https://example.com/profile.jpg"
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: "john.doe@example.com"
 *                     modules:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: "HR, Payroll"
 *                     fullName:
 *                       type: string
 *                       example: "John A. Doe"
 *       401:
 *         description: Authentication failed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Authentication failed"
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred"
 *     tags:
 *       - WebAuthn
 */

import passport from "passport";
import dotenv from "dotenv";
import logAuditTrail from "../../utils/auditLogger.mjs";

dotenv.config();

const webAuthnLogin = (req, res, next) => {
  passport.authenticate("webauthn", async (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res
        .status(401)
        .json({ message: info?.message || "Authentication failed" });
    }

    req.logIn(user, async (err) => {
      if (err) return next(err);

      const { geolocation, userAgent } = req.body;

      // Store session details
      req.session.userAgent = userAgent;
      req.session.latitude = geolocation?.latitude;
      req.session.longitude = geolocation?.longitude;

      const loginAt = new Date();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      req.session.loginAt = loginAt;
      req.session.expiresAt = expiresAt;

      await logAuditTrail({
        userId: req.user._id,
        action: "LOGIN",
        entityType: "authentication",
        oldData: null,
        newData: {
          loginMethod: "WebAuthn",
          sessionId: req.sessionID, // Session ID
          ipAddress: req.ip,
          userAgent: req.body.userAgent,
          geolocation: geolocation,
        },
        description: `${user.username} logged in successfully using WebAuthn`,
        ipAddress: req.ip,
        userAgent: req.body.userAgent,
        geolocation: geolocation,
      });

      // Send successful login response
      return res.status(200).json({
        message: "Login successful",
        user: {
          username: user.username,
          rank: user.rank,
          firstName: user.first_name,
          middleName: user.middle_name,
          lastName: user.last_name,
          employeePhoto: user.employee_photo,
          favoriteModules: user.favoriteModules,
          email: user.email,
          modules: user.modules,
          fullName: user.getFullName(),
          sessionExpiresAt: expiresAt,
          fcmTokens: user.fcmTokens,
          isSuperUser: user.isSuperUser,
        },
      });
    });
  })(req, res, next);
};

export default webAuthnLogin;
