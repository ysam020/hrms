/**
 * @swagger
 * /api/delete-backup-codes:
 *   delete:
 *     summary: Delete backup codes
 *     description: Deletes all backup codes associated with user.
 *     responses:
 *       200:
 *         description: Backup codes deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Backup codes deleted"
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Error deleting backup codes"
 *     tags:
 *       - Backup Codes
 */

import mongoose from "mongoose";
import UserModel from "../../model/userModel.mjs";
import dotenv from "dotenv";
import logAuditTrail from "../../utils/auditLogger.mjs";

dotenv.config();

const deleteBackupCodes = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const username = req.user.username;

    // Find user within the session
    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    // Clear backup codes
    user.backupCodes = [];

    // Save user within session
    await user.save({ session });

    // Log audit trail
    await logAuditTrail({
      userId: user._id,
      action: "DELETE_BACKUP_CODES",
      entityType: "user",
      description: `${username} deleted their backup codes`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Commit transaction and end session
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Backup codes deleted" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({ message: "Error deleting backup codes" });
  }
};

export default deleteBackupCodes;
