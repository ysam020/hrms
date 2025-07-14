/**
 * @swagger
 * /api/disable-two-factor:
 *   delete:
 *     summary: Disable two-factor authentication
 *     description: Disables two-factor authentication for the user. It also removes the associated twoFactorSecret and QR code.
 *     responses:
 *       200:
 *         description: Successfully disabled two-factor authentication
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Two factor authentication disabled"
 *       404:
 *         description: User not found - if the user doesn't exist
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal Server Error - error disabling two-factor authentication
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to disable two-factor authentication"
 *     tags:
 *       - Two Factor Authentication
 */

import mongoose from "mongoose";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const disableTwoFactor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const username = req.user.username;

    // Find user with session
    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "User not found" });
    }

    // Disable 2FA fields
    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.qrCodeImage = null;

    // Save user within session
    await user.save({ session });

    // Log audit trail
    await logAuditTrail({
      userId: user._id,
      action: "DISABLE_2FA",
      entityType: "user",
      description: `${username} disabled two-factor authentication`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Commit transaction & end session
    await session.commitTransaction();
    session.endSession();

    res.send({ message: "Two factor authentication disabled" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res
      .status(500)
      .send({ message: "Failed to disable two-factor authentication" });
  }
};

export default disableTwoFactor;
