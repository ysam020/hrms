import { generateChallenge } from "./generateChallenge.mjs";
import { storeChallenge } from "./challengeStore.mjs";
import UserModel from "../model/userModel.mjs";
import base64url from "base64url";

export async function generateAssertionOptions(username) {
  try {
    const user = await UserModel.findOne({ username });

    if (!user) {
      return {
        error: true,
        message: `User ${username} not found`,
      };
    }

    if (!user.webAuthnCredentials || user.webAuthnCredentials.length === 0) {
      return {
        error: true,
        message: `No WebAuthn credentials found for user ${username}`,
      };
    }

    // Generate a new challenge for assertion
    const challenge = generateChallenge();

    // Store challenge in Redis for later verification
    await storeChallenge(username, challenge);

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
        transports: cred.transports || ["usb", "nfc", "ble", "internal"],
      })),
      timeout: 60000,
      userVerification: "required",
    };

    return assertionOptions;
  } catch (error) {
    console.error(`Error generating assertion options:`, error);
    throw new Error(`Error generating assertion options: ${error.message}`);
  }
}
