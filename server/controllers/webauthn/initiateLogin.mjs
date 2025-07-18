/**
 * @swagger
 * /api/webauthn-login-options:
 *   post:
 *     summary: Generate WebAuthn assertion options for login
 *     description: This route generates WebAuthn assertion options required for the user to complete the authentication process during login. It returns the options necessary for the client to generate an assertion.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "johndoe"
 *     responses:
 *       200:
 *         description: Successfully generated WebAuthn assertion options for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 challenge:
 *                   type: string
 *                   example: "y5e3t5hsf9ur9fj4jq3wj44f..."
 *                 rpId:
 *                   type: string
 *                   example: "example.com"
 *                 timeout:
 *                   type: integer
 *                   example: 60000
 *                 allowCredentials:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "v5f8n2mn23fov34f324fdv3f..."
 *                       type:
 *                         type: string
 *                         example: "public-key"
 *       500:
 *         description: Internal server error. Failed to generate WebAuthn assertion options.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to generate assertion options"
 *     tags:
 *       - WebAuthn
 */

import { generateAssertionOptions } from "../../utils/generateAssertionOptions.mjs";
import User from "../../model/userModel.mjs";

const initiateLogin = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        error: true,
        message: "Username is required",
      });
    }

    // Step 1: Check if user exists and get employee status
    const user = await User.findOne({ username }).select(
      "webAuthnCredentials isTwoFactorEnabled employeeStatus"
    );

    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User not found",
      });
    }

    // Step 2: Check employee status
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
      return res.status(403).json({
        error: true,
        message,
      });
    }

    // Step 3: Check if user has WebAuthn credentials
    if (!user.webAuthnCredentials || user.webAuthnCredentials.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No WebAuthn credentials found",
        fallbackToPassword: true, // This flag tells frontend to show password login
        isTwoFactorEnabled: user.isTwoFactorEnabled,
      });
    }

    // Step 4: Generate assertion options for WebAuthn login
    const options = await generateAssertionOptions(username);

    // Check if there was an error generating options
    if (options.error) {
      return res.status(500).json({
        error: true,
        message: "Failed to generate assertion options",
      });
    }

    console.log("WebAuthn login options generated for:", username);
    res.status(200).json({
      ...options,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    });
  } catch (error) {
    console.error(
      `Error initiating WebAuthn login for "${req.body?.username}":`,
      error
    );
    res.status(500).json({
      error: true,
      message: "Failed to initiate WebAuthn login",
    });
  }
};

export default initiateLogin;
