/**
 * @swagger
 * /api/logout-from-all-sessions:
 *   get:
 *     summary: Log out the user from all active sessions
 *     description: This endpoint logs the user out from all active sessions by clearing all sessions associated with their username. It also invalidates the JWT token and clears the authentication cookie.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out the user from all sessions.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Success"
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
 *                   example: "Internal server error"
 *     tags:
 *       - Authentication
 */

import mongoose from "mongoose";
import logAuditTrail from "../../utils/auditLogger.mjs";

const logoutFromAllSessions = async (req, res) => {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No user logged in" });
    }

    const userId = req.user._id.toString();

    // Access MongoDB collection where sessions are stored
    const db = mongoose.connection.db;
    const sessionCollection = db.collection("sessions");

    // Delete all sessions where `passport.user` matches `userId`
    await sessionCollection.deleteMany({
      session: { $regex: `"passport":{"user":"${userId}"` }, // Match user ID inside the JSON string
    });

    // Log the audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "LOGOUT_ALL_SESSIONS",
      entityType: "user",
      description: `${req.user.username} logged out from all sessions`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Destroy the current session
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Error destroying session" });
      }
      res.clearCookie("connect.sid"); // Clear session cookie
      return res.status(200).json({ message: "Success" });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default logoutFromAllSessions;
