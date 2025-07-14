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

const initiateLogin = async (req, res) => {
  try {
    const { username } = req.body;
    // Generate assertion options for WebAuthn login
    const options = await generateAssertionOptions(username);

    res.status(200).json(options);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to generate assertion options" });
  }
};

export default initiateLogin;
