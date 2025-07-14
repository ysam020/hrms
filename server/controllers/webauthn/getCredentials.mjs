/**
 * @swagger
 * /api/get-credentials:
 *   post:
 *     summary: Retrieve WebAuthn credentials for a user
 *     description: This route allows fetching the WebAuthn credentials associated with a specific user. It returns an array of credential IDs associated with the user's WebAuthn credentials.
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
 *         description: Successfully retrieved the WebAuthn credential IDs for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 example: "v5f8n2mn23fov34f324fdv3f..."
 *       404:
 *         description: User not found. No user with the provided username exists in the database.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal server error. An error occurred while fetching credentials.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while fetching credentials. Please try again later"
 *     tags:
 *       - WebAuthn
 */

import UserModel from "../../model/userModel.mjs";

const getCredentials = async (req, res) => {
  try {
    const { username } = req.body;
    // Find the user by username
    const user = await UserModel.findOne({ username });
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // Map the webAuthnCredentials to extract credential IDs
    const credentials = user.webAuthnCredentials.map(
      (credential) => credential.credentialID
    );

    res.status(200).send(credentials);
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message:
        "An error occurred while fetching credentials. Please try again later",
    });
  }
};

export default getCredentials;
