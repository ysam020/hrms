/**
 * @swagger
 * /api/send-backup-codes-email:
 *   get:
 *     summary: Send backup codes via email
 *     description: This route sends an email to the user with their backup codes in a CSV format as an attachment. The email is sent using AWS SES, and the backup codes are decrypted before being attached as a CSV file.
 *     responses:
 *       200:
 *         description: Email sent successfully with the backup codes attached.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email sent successfully!"
 *       404:
 *         description: User not found in the database.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal server error. Failed to send email due to server issues.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to send email"
 *     tags:
 *       - Backup Codes
 */

import UserModel from "../../model/userModel.mjs";
import dotenv from "dotenv";
import { backupCodesTemplate } from "../../templates/backupCodesTemplate.mjs";
import transporter from "../../utils/transporter.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

dotenv.config();

const createMimeEmail = (from, to, subject, bodyHtml, attachment) => {
  const boundary = "----=_Part_0_1234567890.0987654321";

  const emailBody = [
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    "",
    bodyHtml,
    `--${boundary}`,
    `Content-Type: text/csv; name="backup_codes.csv"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="backup_codes.csv"`,
    "",
    attachment.toString("base64"),
    `--${boundary}--`,
  ].join("\n");

  return emailBody;
};

const sendBackupCodesMail = async (req, res) => {
  const session = await UserModel.startSession();
  session.startTransaction();

  try {
    const username = req.user.username;

    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    // Create CSV string for backup codes
    const header = "Backup Codes\n";
    const csvContent = user.backupCodes
      .map((code) => user.decryptField("backupCodes", code))
      .join("\n");
    const csv = header + csvContent;

    const csvBuffer = Buffer.from(csv);
    const fullName = user.getFullName();
    const bodyHtml = backupCodesTemplate(fullName);

    // Commit transaction BEFORE sending the email
    await logAuditTrail({
      userId: user._id,
      action: "MAIL_BACKUP_CODES",
      entityType: "user",
      description: `${username} sent backup codes via email`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    const rawEmail = createMimeEmail(
      process.env.EMAIL_FROM,
      user.email,
      "Paymaster Backup Codes",
      bodyHtml,
      csvBuffer
    );

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: "Paymaster Backup Codes",
      raw: rawEmail,
    };

    try {
      await transporter.sendMail(mailOptions);
      return res.status(200).json({ message: "Email sent successfully!" });
    } catch (emailError) {
      console.error("Error sending email:", emailError);
      return res.status(500).json({ message: "Failed to send email" });
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    return res.status(500).json({ message: "Failed to send email" });
  }
};

export default sendBackupCodesMail;
