/**
 * @swagger
 * /api/send-forgot-password-otp:
 *   post:
 *     summary: Request password reset OTP
 *     description: Sends a one-time password (OTP) to the user's email for password reset. The OTP is valid for 5 minutes.
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
 *     responses:
 *       200:
 *         description: OTP sent successfully to the user's email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "OTP sent to your email"
 *       400:
 *         description: Bad Request - Missing username or invalid format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Missing username or invalid format"
 *       404:
 *         description: User not found - No user found with the provided username
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal Server Error - Error sending the email or processing the OTP
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

import User from "../../model/userModel.mjs";
import { forgotPasswordTemplate } from "../../templates/forgotPasswordTemplate.mjs";
import { emailQueue } from "../../config/queueConfig.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const sendForgotPasswordOtp = async (req, res) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    const { username } = req.body;

    if (!username || typeof username !== "string" || username.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Missing or invalid username" });
    }

    const user = await User.findOne({ username: username.trim() }).session(
      session
    );
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Encrypt and save OTP with expiration
    user.encryptField("resetPasswordOTP", otp);
    user.resetPasswordExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
    await user.save({ session });

    // Log audit trail
    await logAuditTrail({
      userId: user._id,
      action: "FORGOT_PASSWORD_OTP",
      entityType: "authentication",
      description: `${user.username} requested a password reset OTP`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Prepare email content and send response after commit
    const html = forgotPasswordTemplate(user.username, otp);

    res.status(200).json({ message: "OTP sent to your email" });

    // Add email job asynchronously (outside transaction)
    emailQueue.add(
      "send-mail",
      {
        from: process.env.EMAIL_FROM,
        to: user.email,
        subject: "Password Reset OTP",
        html,
      },
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 1000 },
      }
    );
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default sendForgotPasswordOtp;
