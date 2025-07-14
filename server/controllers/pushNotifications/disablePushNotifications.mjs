/**
 * @swagger
 * /api/disable-push-notifications:
 *   delete:
 *     summary: Disable push notifications for the authenticated user
 *     description: This route disables push notifications for the authenticated user by clearing their Firebase Cloud Messaging (FCM) tokens. The user must be authenticated via a valid session.
 *     responses:
 *       200:
 *         description: Successfully disabled push notifications for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Push notification disabled"
 *       404:
 *         description: User not found. The user with the provided session token doesn't exist in the database.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal server error. Failed to disable push notifications.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to disable push notifications"
 *     tags:
 *       - Push Notifications
 */

import mongoose from "mongoose";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const disablePushNotifications = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const username = req.user.username;

    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    user.fcmTokens = [];
    await user.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: "DISABLE_PUSH_NOTIFICATIONS",
      entityType: "user",
      description: `${username} disabled push notifications`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: "Push notifications disabled" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Transaction error:", err);
    next(err);
  }
};

export default disablePushNotifications;
