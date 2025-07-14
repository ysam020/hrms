/**
 * @swagger
 * /api/logout:
 *   post:
 *     summary: Log out the user by invalidating the session
 *     description: This endpoint logs out the user by removing the session associated with the provided JWT token and username. It also clears the authentication cookie.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 example: "jwt_token_here"
 *               username:
 *                 type: string
 *                 example: "user_name"
 *     responses:
 *       200:
 *         description: Successfully logged out the user and invalidated the session.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Logged out successfully"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized: No token provided"
 *       404:
 *         description: User not registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal server error if something goes wrong.
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

import dotenv from "dotenv";
import logAuditTrail from "../../utils/auditLogger.mjs";

dotenv.config();

const logout = async (req, res, next) => {
  try {
    const sessionInfo = {
      sessionId: req.sessionID,
      userId: req.user?._id,
      username: req.user?.username,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    };

    await logAuditTrail({
      userId: req.user?._id,
      action: "LOGOUT",
      entityType: "authentication",
      oldData: {
        sessionId: sessionInfo.sessionId,
        ipAddress: sessionInfo.ipAddress,
        userAgent: sessionInfo.userAgent,
      },
      description: `${sessionInfo.username} logged out from session ID: ${sessionInfo.sessionId}, `,
      ipAddress: sessionInfo.ipAddress,
      userAgent: sessionInfo.userAgent,
    });

    req.logout((err) => {
      if (err) {
        console.error("Logout Error:", err);
        return res.status(500).json({ message: "Error logging out" });
      }

      req.session.destroy((err) => {
        if (err) {
          console.error("Session Destroy Error:", err);
          return res.status(500).json({ message: "Error destroying session" });
        }

        res.clearCookie("connect.sid"); // Optional: Clears the session cookie
        return res.json({ message: "Logged out successfully" });
      });
    });
  } catch (err) {
    console.error("Logout Exception:", err);
    next(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export default logout;
