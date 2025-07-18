/**
 * @swagger
 * /api/disable-webauthn:
 *   get:
 *     summary: Disable WebAuthn for the current user
 *     description: This route allows the user to disable WebAuthn by clearing their WebAuthn credentials from the database. The user must be authenticated using a valid session token.
 *     responses:
 *       200:
 *         description: Successfully disabled WebAuthn for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "WebAuthn disabled"
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal server error. Failed to disable WebAuthn credentials.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to disable WebAuthn"
 *     tags:
 *       - WebAuthn
 */

import mongoose from "mongoose";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const disableWebAuthn = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const username = req.user.username;

    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    user.webAuthnCredentials = [];
    await user.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: "DISABLE_WEBAUTHN",
      entityType: "authentication",
      description: `${req.user.username} disabled WebAuthn`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    res.status(200).json({ message: "WebAuthn disabled" });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

export default disableWebAuthn;
