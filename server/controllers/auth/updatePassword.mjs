/**
 * @swagger
 * /api/update-password:
 *   put:
 *     summary: Reset user password using OTP
 *     description: This route allows a user to reset their password by providing a valid OTP (One-Time Password). The OTP must be the same as the one stored in the user's record and should not be expired. The route hashes the new password, updates the user's password, and clears the OTP and expiration fields. The user's failed login attempts are reset, and the account is unblocked if previously blocked.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: The username of the user resetting the password.
 *               otp:
 *                 type: string
 *                 description: The OTP provided by the user to validate the password reset.
 *               password:
 *                 type: string
 *                 description: The new password to be set for the user.
 *     responses:
 *       200:
 *         description: Password successfully reset.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to send email"
 *       400:
 *         description: Invalid or expired OTP.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid or expired OTP"
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
 *         description: Internal server error. Failed to reset the password due to a server issue.
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
import User from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const updatePassword = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { username, otp, password } = req.body;

    // Find the user with the session
    const user = await User.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    // Validate OTP
    if (
      user.decryptField("resetPasswordOTP", user.resetPasswordOTP) !== otp ||
      user.resetPasswordExpires < Date.now()
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Update password and reset fields
    user.password = password;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    user.failedLoginAttempts = 0;
    user.isBlocked = false;
    user.blockedUntil = null;

    await user.save({ session });

    // Log audit trail
    await logAuditTrail({
      userId: user._id,
      action: "PASSWORD_RESET",
      entityType: "authentication",
      description: `${username} reset their password via OTP`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Password has been successfully reset" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default updatePassword;
