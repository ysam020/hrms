/**
 * @swagger
 * /api/webauthn-register:
 *   get:
 *     summary: Generate WebAuthn attestation options for user registration
 *     description: This route generates WebAuthn attestation options required for a user to register their WebAuthn credentials. It returns the options necessary for the client to complete the attestation process.
 *     responses:
 *       200:
 *         description: Successfully generated WebAuthn attestation options for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 challenge:
 *                   type: string
 *                   example: "d5v8mn3f9w25f9w8q9u4e5r9..."
 *                 rpId:
 *                   type: string
 *                   example: "example.com"
 *                 timeout:
 *                   type: integer
 *                   example: 60000
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "12345"
 *                     name:
 *                       type: string
 *                       example: "johndoe"
 *                     displayName:
 *                       type: string
 *                       example: "John Doe"
 *                 pubKeyCredParams:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string"public-key").
 *                         example: "public-key"
 *                       alg:
 *                         type: integer
 *                         example: -7
 *       500:
 *         description: Internal server error. Failed to generate WebAuthn attestation options.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to generate attestation options"
 *     tags:
 *       - WebAuthn
 */

// import { generateAttestationOptions } from "../../utils/generateAttestationOptions.mjs";
// import UserModel from "../../model/userModel.mjs";

// const initiateRegistration = async (req, res) => {
//   try {
//     const username = req.user.username;
//     const user = await UserModel.findOne({ username });

//     await user.save();
//     const options = await generateAttestationOptions(username);
//     res.status(200).json(options);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to generate attestation options" });
//   }
// };

// export default initiateRegistration;

import { generateAttestationOptions } from "../../utils/generateAttestationOptions.mjs";
import UserModel from "../../model/userModel.mjs";

const initiateRegistration = async (req, res) => {
  try {
    const username = req.user.username;

    const user = await UserModel.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.save();
    const options = await generateAttestationOptions(username);

    res.status(200).json(options);
  } catch (error) {
    console.error("Registration initiation error:", error);
    res.status(500).json({ message: "Failed to generate attestation options" });
  }
};

export default initiateRegistration;
