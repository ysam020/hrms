import { generateChallenge } from "./generateChallenge.mjs";
import { storeChallenge } from "./challengeStore.mjs";
import UserModel from "../model/userModel.mjs";
import base64url from "base64url";

export async function generateAttestationOptions(username) {
  try {
    let user = await UserModel.findOne({ username });
    if (!user) {
      // If user doesn't exist, create a new user
      user = await UserModel.create({ username });
    }

    // Generate attestation options based on user data
    const challenge = generateChallenge();

    // Wait for the storeChallenge function
    await storeChallenge(username, challenge);

    const attestationOptions = {
      challenge,
      rpId:
        process.env.NODE_ENV === "production"
          ? "sameer-yadav.site"
          : "localhost",
      rp: { name: "WebAuthn" },
      user: {
        id: base64url.encode(Buffer.from(user.username)),
        name: user.username,
        displayName: user.username,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      timeout: 60000,
      attestation: "direct",
      excludeCredentials: user.webAuthnCredentials.map((cred) => ({
        type: "public-key",
        id: base64url.toBuffer(cred.credentialID),
        transports: cred.transports || ["usb", "nfc", "ble", "internal"],
      })),
    };

    return attestationOptions;
  } catch (error) {
    throw new Error(`Error generating attestation options: ${error.message}`);
  }
}
