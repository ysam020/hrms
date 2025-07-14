/**
 * @swagger
 * /api/webauthn-verify-login:
 *   post:
 *     summary: Verify WebAuthn assertion response for login
 *     description: This route verifies the WebAuthn assertion response during the login process. It checks whether the provided WebAuthn credentials match the user's credentials, allowing them to successfully log in.
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
 *               credential:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "V6CgS3x0RnmMjfIf2vPbvgFv3pTSG..."
 *                   rawId:
 *                     type: string
 *                     example: "6bb86e1b5a25b1184a9fe3032e8b58cd"
 *                   response:
 *                     type: object
 *                     properties:
 *                       clientDataJSON:
 *                         type: string
 *                         example: "eyJ0eXAiOiJKV1QifQ..."
 *                       authenticatorData:
 *                         type: string
 *                         example: "n02mS3ln1wdvw0qS1huHhU0T2kak3I0w"
 *                       signature:
 *                         type: string
 *                         example: "h3ss2qKmMlpVjP8nSmZBhNk6wQcflA="
 *     responses:
 *       200:
 *         description: Successfully verified the WebAuthn assertion response and logged in the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *       500:
 *         description: Internal server error. Failed to verify the assertion response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to verify assertion response"
 *     tags:
 *       - WebAuthn
 */

import { verifyAssertionResponse } from "../../utils/verifyAssertionResponse.mjs";

const verifyLogin = async (req, res) => {
  try {
    const { username, credential } = req.body;
    // Verify assertion response during WebAuthn login
    const loginResponse = await verifyAssertionResponse(username, credential);

    res.status(200).json(loginResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to verify assertion response" });
  }
};

export default verifyLogin;
