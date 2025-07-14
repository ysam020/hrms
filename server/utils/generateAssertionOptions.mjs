import { generateChallenge } from "./generateChallenge.mjs";
import UserModel from "../model/userModel.mjs";
import base64url from "base64url";

export async function generateAssertionOptions(username) {
  try {
    const user = await UserModel.findOne({ username });

    if (!user) {
      // If user doesn't exist, return a response indicating the user was not found
      return {
        error: true,
        message: `User ${username} not found`,
      };
    }

    // Generate a new challenge for assertion
    const challenge = generateChallenge();

    // Prepare options for WebAuthn assertion
    const assertionOptions = {
      challenge,
      rpId:
        process.env.NODE_ENV === "production"
          ? "sameer-yadav.site"
          : "localhost",
      allowCredentials: user.webAuthnCredentials.map((cred) => ({
        type: "public-key",
        id: base64url.toBuffer(cred.credentialID),
        transports: cred.transports,
      })),
      timeout: 60000,
    };
    return assertionOptions;
  } catch (error) {
    throw new Error(`Error generating assertion options: ${error.message}`);
  }
}
