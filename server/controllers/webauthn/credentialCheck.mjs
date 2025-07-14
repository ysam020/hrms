/**
 * @swagger
 * /api/webauthn-credential-check:
 *   post:
 *     summary: Check if user has WebAuthn credentials and if two-factor authentication is enabled
 *     description: This route checks if the user has WebAuthn credentials stored and whether two-factor authentication is enabled for their account. It returns whether WebAuthn credentials are available and the status of 2FA.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: The username of the user to check for WebAuthn credentials and 2FA status.
 *                 example: "user_name"
 *     responses:
 *       200:
 *         description: User's WebAuthn credential status and 2FA status successfully retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasCredentials:
 *                   type: boolean
 *                   example: true
 *                 isTwoFactorEnabled:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: User not found. The provided username does not exist in the database.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal server error. Failed to check WebAuthn credentials.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to check credentials"
 *     tags:
 *       - WebAuthn
 */

import User from "../../model/userModel.mjs";

const credentialCheck = async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username }).select(
      "webAuthnCredentials isTwoFactorEnabled employeeStatus"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { employeeStatus } = user;

    if (
      employeeStatus === "Absconded" ||
      employeeStatus === "Terminated" ||
      employeeStatus === "Resigned"
    ) {
      let message = "You don't have access to the platform.";
      if (employeeStatus === "Terminated") {
        message =
          "Your account has been terminated. You no longer have access to the platform.";
      } else if (employeeStatus === "Absconded") {
        message =
          "You have been marked as absconded and no longer have access to the platform.";
      } else if (employeeStatus === "Resigned") {
        message =
          "You have resigned and your access to the platform has been revoked.";
      }

      return res.status(403).json({ message });
    }

    const isTwoFactorEnabled = user.isTwoFactorEnabled;

    if (!user.webAuthnCredentials || user.webAuthnCredentials.length === 0) {
      return res
        .status(200)
        .json({ hasCredentials: false, isTwoFactorEnabled });
    }

    res.status(200).json({ hasCredentials: true, isTwoFactorEnabled });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to check credentials" });
  }
};

export default credentialCheck;
