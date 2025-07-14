/**
 * @swagger
 * /api/enable-two-factor:
 *   get:
 *     summary: Enable two-factor authentication
 *     description: Enables two-factor authentication for the user. This generates a twoFactorSecret, a QR code, and backup codes (if not available). It also encrypts the secret and backup codes before saving it to the database.
 *     responses:
 *       200:
 *         description: Successfully enabled two-factor authentication
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Two-factor authentication enabled"
 *                 qrCodeImage:
 *                   type: string
 *                   format: uri
 *                   example: "data:image/png;base64,...."
 *                 backupCodes:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: "12345678"
 *       404:
 *         description: User not found - If the user doesn't exist
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal Server Error - Error enabling two-factor authentication
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while enabling 2FA"
 *     tags:
 *       - Two Factor Authentication
 */

import mongoose from "mongoose";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const enableTwoFactor = async (req, res) => {
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

    // Generate 2FA secret
    const secret = speakeasy.generateSecret({
      name: `Paymaster CRM (${username})`,
    });

    // Encrypt the secret and update user
    user.encryptField("twoFactorSecret", secret.base32);
    user.isTwoFactorEnabled = true;

    // Generate QR code for otpauth URL
    const qrCodeImage = await QRCode.toDataURL(secret.otpauth_url);
    user.qrCodeImage = qrCodeImage;

    // Generate backup codes if none exist
    if (!user.backupCodes || user.backupCodes.length === 0) {
      user.generateBackupCodes();
    }

    // Save user within the transaction session
    await user.save({ session });

    // Log audit trail within the transaction
    await logAuditTrail({
      userId: user._id,
      action: "ENABLE_2FA",
      entityType: "user",
      description: `${username} enabled two-factor authentication`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Decrypt backup codes to send in response
    const decryptedBackupCodes = user.backupCodes.map((encryptedCode) =>
      user.decryptField("twoFactorSecret", encryptedCode)
    );

    res.status(200).json({
      message: "Two-factor authentication enabled",
      qrCodeImage,
      twoFactorSecret: secret.base32,
      backupCodes: decryptedBackupCodes,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({ message: "An error occurred while enabling 2FA" });
  }
};

export default enableTwoFactor;
