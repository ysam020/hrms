/**
 * @swagger
 * /api/request-new-backup-codes:
 *   get:
 *     summary: Generate new backup codes for the user
 *     description: This endpoint allows a user to request new backup codes. The user's backup codes are regenerated and saved in database after encryption, and the new set of decrypted backup codes is sent back in the response.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully generated new backup codes for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "New backup codes generated"
 *                 backupCodes:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: "AA00AA00"
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
 *         description: Internal server error if something goes wrong.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Error generating new backup codes"
 *     tags:
 *       - Backup Codes
 */

import UserModel from "../../model/userModel.mjs";
import dotenv from "dotenv";
import protobuf from "protobufjs";
import path from "path";
import { fileURLToPath } from "url";
import { mongoose } from "mongoose";
import logAuditTrail from "../../utils/auditLogger.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const requestNewBackupCodes = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const root = await protobuf.load(
      path.join(__dirname, "../../proto/user.proto")
    );
    const BackupCodesResponse = root.lookupType(
      "userpackage.BackupCodesResponse"
    );

    const username = req.user.username;

    // Find user within transaction session
    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    // Generate new backup codes
    const newBackupCodes = user.generateBackupCodes();

    // Save updated user with new backup codes inside session
    await user.save({ session });

    // Log audit trail
    await logAuditTrail({
      userId: user._id,
      action: "GENERATE_BACKUP_CODES",
      entityType: "user",
      description: `${username} generated new backup codes`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    // Prepare protobuf message after commit
    const message = BackupCodesResponse.create({ backupCodes: newBackupCodes });
    const error = BackupCodesResponse.verify(message);
    if (error) {
      throw Error(error);
    }

    const buffer = BackupCodesResponse.encode(message).finish();

    res.set("Content-Type", "application/x-protobuf");
    res.send(buffer);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({ message: "Error generating new backup codes" });
  }
};

export default requestNewBackupCodes;
