// import { generateChallenge } from "./generateChallenge.mjs";
// import UserModel from "../model/userModel.mjs";
// import base64url from "base64url";

// export async function generateAssertionOptions(username) {
//   try {
//     const user = await UserModel.findOne({ username });

//     if (!user) {
//       // If user doesn't exist, return a response indicating the user was not found
//       return {
//         error: true,
//         message: `User ${username} not found`,
//       };
//     }

//     // Generate a new challenge for assertion
//     const challenge = generateChallenge();

//     // Prepare options for WebAuthn assertion
//     const assertionOptions = {
//       challenge,
//       rpId:
//         process.env.NODE_ENV === "production"
//           ? "sameer-yadav.site"
//           : "localhost",
//       allowCredentials: user.webAuthnCredentials.map((cred) => ({
//         type: "public-key",
//         id: base64url.toBuffer(cred.credentialID),
//         transports: cred.transports,
//       })),
//       timeout: 60000,
//     };
//     return assertionOptions;
//   } catch (error) {
//     throw new Error(`Error generating assertion options: ${error.message}`);
//   }
// }

// 1. Fixed server/utils/generateAssertionOptions.mjs
import { generateChallenge } from "./generateChallenge.mjs";
import { storeChallenge, debugChallenges } from "./challengeStore.mjs";
import UserModel from "../model/userModel.mjs";
import base64url from "base64url";

export async function generateAssertionOptions(username) {
  try {
    console.log(`🔑 GENERATING LOGIN OPTIONS for user: "${username}"`);

    const user = await UserModel.findOne({ username });

    if (!user) {
      console.log(`❌ User not found: "${username}"`);
      return {
        error: true,
        message: `User ${username} not found`,
      };
    }

    if (!user.webAuthnCredentials || user.webAuthnCredentials.length === 0) {
      console.log(`❌ No WebAuthn credentials found for user: "${username}"`);
      return {
        error: true,
        message: `No WebAuthn credentials found for user ${username}`,
      };
    }

    // Generate a new challenge for assertion
    const challenge = generateChallenge();

    // ✅ Store challenge in Redis for later verification
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

    console.log(`✅ Login options generated for: "${username}"`);
    console.log(`   Challenge: "${challenge}"`);
    console.log(`   Allowed credentials: ${user.webAuthnCredentials.length}`);

    await debugChallenges();

    return assertionOptions;
  } catch (error) {
    console.error(`❌ Error generating assertion options:`, error);
    throw new Error(`Error generating assertion options: ${error.message}`);
  }
}
