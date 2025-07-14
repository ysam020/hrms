import { generateChallenge } from "./generateChallenge.mjs";
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
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 60000,
      attestation: "direct",
    };

    return attestationOptions;
  } catch (error) {
    throw new Error(`Error generating attestation options: ${error.message}`);
  }
}
