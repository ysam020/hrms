/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: User login
 *     description: >
 *       This endpoint logs in a user by validating their credentials. The login process includes the following steps:
 *
 *       1. **Basic Authentication**: The user provides a `username` and `password`.
 *          - **Correct Password**: Proceed to two-factor authentication if enabled.
 *          - **Incorrect Password**: The server increments the failed login attempt counter for the user, and the user receives a warning mail that there has been a login attempt on their account with incorrect credentials. If the number of attempts reaches a configured threshold, the account is temporarily blocked.
 *          - **Blocked Account**: If the account is blocked due to repeated failed attempts, the response includes an `unblockTime`, informing the user when they can try logging in again. Or they can reset their password to unblock their account.
 *       2. **Two-Factor Authentication (2FA)**:
 *          - If `isTwoFactorEnabled` is true, the user must provide a valid `twoFAToken`.
 *          - Alternatively, if `useBackupCode` is true, the user can provide a `backupCode`. In this case, password is not required.
 *
 *       3. **Device and Location Tracking**:
 *          - The client should send additional details like `userAgent` (to identify the browser or device) and `geolocation` data (`latitude`, `longitude`).
 *
 *       4. **Response Handling**:
 *          - If login is successful, user data and `sessionID` (JWT token) are returned.
 *          - If the account is blocked, a 403 response with an `unblockTime` is sent.
 *          - If login fails due to an unregistered user, a 404 response is sent.
 *
 *       5. **Error Codes**:
 *          - This endpoint provides different responses based on the login attempt, including codes for unauthorized access, account blocking, and unregistered users.
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "user_name"
 *               password:
 *                 type: string
 *                 example: "1234"
 *               twoFAToken:
 *                 type: string
 *                 example: "123456"
 *               backupCode:
 *                 type: string
 *                 example: "12345678"
 *               userAgent:
 *                 type: string
 *                 example: "Mozilla/5.0"
 *               geolocation:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     example: 37.7749
 *                   longitude:
 *                     type: number
 *                     example: -122.4194
 *               isTwoFactorEnabled:
 *                 type: boolean
 *                 example: false
 *               useBackupCode:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Login successful or with messages on unsuccessful attempts.
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
 *                       example: "user_name"
 *                     rank:
 *                       type: Number
 *                       example: 1
 *                     first_name:
 *                       type: string
 *                       example: "John"
 *                     middle_name:
 *                       type: string
 *                       example: "A."
 *                     last_name:
 *                       type: string
 *                       example: "Doe"
 *                     employee_photo:
 *                       type: string
 *                       example: "url_to_photo"
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *                     modules:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: "dashboard"
 *                     sessionID:
 *                       type: string
 *                       example: "jwt_token_here"
 *                     fullName:
 *                       type: string
 *                       example: "John A. Doe"
 *                 unblockTime:
 *                   type: string
 *                   example: "2024-12-01T23:59:59.000Z"
 *       400:
 *         description: Bad Request - missing required fields or invalid data.
 *       401:
 *         description: Unauthorized - failed authentication.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid 2FA token"
 *       403:
 *         description: Account blocked.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Account blocked until 2023-12-31T23:59:59.000Z. You can try resetting your password."
 *       404:
 *         description: User not registered.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not registered"
 *       500:
 *         description: Internal Server Error - an error occurred on the server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Something went wrong"
 *     tags:
 *       - Authentication
 */

import passport from "passport";
import logAuditTrail from "../../utils/auditLogger.mjs";

const login = async (req, res, next) => {
  passport.authenticate("custom-login", async (err, user, info) => {
    if (err) return next(err);

    // Failed login attempt
    if (!user) {
      try {
        await logAuditTrail({
          userId: req.user._id,
          action: "LOGIN_FAILED",
          entityType: "authentication",
          oldData: null,
          newData: {
            reason: info.message,
            ipAddress: req.ip,
            userAgent: req.body.userAgent,
          },
          description: `Failed login attempt for user ${req.body.username}: ${info.message}`,
          ipAddress: req.ip,
          userAgent: req.body.userAgent,
        });
        return res.status(401).json({ message: info.message });
      } catch (logErr) {
        console.error(
          "Failed to log audit trail for failed login attempt:",
          logErr
        );
        return res.status(500).json({ message: info.message });
      }
    }

    // Successful login (passport will handle session creation)
    req.logIn(user, async (err) => {
      if (err) return next(err);

      const loginAt = new Date();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      const { userAgent, geolocation } = req.body;

      req.session.userAgent = userAgent;
      req.session.latitude = geolocation?.latitude;
      req.session.longitude = geolocation?.longitude;
      req.session.loginAt = loginAt;
      req.session.expiresAt = expiresAt;

      // Log successful login in the strategy
      return res.status(200).json({
        message: "Login successful",
        user: {
          username: user.username,
          rank: user.rank,
          fullName: user.getFullName(),
          face_descriptor: user.face_descriptor,
          email: user.email,
          modules: user.modules,
          favoriteModules: user.favoriteModules,
          employeePhoto: user.employee_photo,
          sessionExpiresAt: expiresAt,
          fcmTokens: user.fcmTokens,
          isSuperUser: user.isSuperUser,
        },
      });
    });
  })(req, res, next);
};

export default login;
