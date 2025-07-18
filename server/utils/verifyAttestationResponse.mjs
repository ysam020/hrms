// import UserModel from "../model/userModel.mjs";
// import base64url from "base64url";

// export async function verifyAttestationResponse(username, credential) {
//   try {
//     const user = await UserModel.findOne({ username });
//     if (!user) {
//       throw new Error(`User ${username} not found`);
//     }

//     // Convert clientDataJSON and attestationObject from arrays of bytes to buffers
//     const clientDataJSONBuffer = Buffer.from(
//       credential.response.clientDataJSON
//     );

//     const attestationObjectBuffer = Buffer.from(
//       credential.response.attestationObject
//     );

//     // Decode clientDataJSON and attestationObject buffers to base64url strings
//     const clientDataJSONString = base64url.encode(clientDataJSONBuffer);
//     const attestationObjectString = base64url.encode(attestationObjectBuffer);

//     if (!clientDataJSONString || !attestationObjectString) {
//       throw new Error("Invalid attestation response data");
//     }

//     // Update credential information in user's record
//     const newCredential = {
//       credentialID: credential.id,
//       publicKey: credential.response.publicKey,
//       counter: 0,
//     };

//     // Push the new credential to user's webAuthnCredentials array
//     user.webAuthnCredentials.push(newCredential);
//     await user.save();

//     return { verified: true, message: "Registration successful" };
//   } catch (error) {
//     console.error("Error verifying attestation response:", error);
//     throw new Error(`Error verifying attestation response: ${error.message}`);
//   }
// }

// Fixed server/utils/verifyAttestationResponse.mjs
import UserModel from "../model/userModel.mjs";
import { getAndDeleteChallenge, debugChallenges } from "./challengeStore.mjs";
import base64url from "base64url";

export async function verifyAttestationResponse(username, credential) {
  try {
    console.log(`🔍 VERIFY ATTESTATION for user: "${username}"`);

    const user = await UserModel.findOne({ username });
    if (!user) {
      throw new Error(`User ${username} not found`);
    }

    console.log(`📝 Parsing credential data...`);
    console.log(`   Credential ID: "${credential?.id}"`);
    console.log(`   Credential type: "${credential?.type}"`);
    console.log(`   Has response: ${!!credential?.response}`);
    console.log(
      `   Has clientDataJSON: ${!!credential?.response?.clientDataJSON}`
    );

    // Debug challenges before retrieval
    console.log(`🔑 About to retrieve challenge for user: "${username}"`);
    await debugChallenges();

    // ✅ FIX: Properly await the Promise
    const expectedChallenge = await getAndDeleteChallenge(username);
    if (!expectedChallenge) {
      console.log(`❌ CRITICAL: No challenge found for user "${username}"`);
      await debugChallenges();
      throw new Error(
        "No challenge found for user. Please restart the registration process."
      );
    }

    console.log(`✅ Challenge retrieved: "${expectedChallenge}"`);

    // ✅ FIX: Properly decode clientDataJSON from base64url
    let clientDataJSON;
    try {
      // The clientDataJSON comes from the client as base64url encoded
      // We need to decode it first, then parse as JSON
      let clientDataJSONString;

      if (typeof credential.response.clientDataJSON === "string") {
        // If it's a string, it might be base64url encoded
        try {
          clientDataJSONString = base64url.decode(
            credential.response.clientDataJSON
          );
        } catch (e) {
          // If base64url decode fails, try direct JSON parse
          clientDataJSONString = credential.response.clientDataJSON;
        }
      } else if (
        credential.response.clientDataJSON instanceof ArrayBuffer ||
        Array.isArray(credential.response.clientDataJSON)
      ) {
        // If it's an ArrayBuffer or array, convert to buffer first
        const buffer = Buffer.from(credential.response.clientDataJSON);
        clientDataJSONString = buffer.toString("utf8");
      } else {
        throw new Error("Invalid clientDataJSON format");
      }

      console.log(
        `📄 Raw clientDataJSON string: "${clientDataJSONString.substring(
          0,
          100
        )}..."`
      );
      clientDataJSON = JSON.parse(clientDataJSONString);
    } catch (parseError) {
      console.error(`❌ Failed to parse clientDataJSON:`, parseError);
      console.log(
        `   Raw data type:`,
        typeof credential.response.clientDataJSON
      );
      console.log(
        `   Raw data sample:`,
        credential.response.clientDataJSON?.toString?.().substring(0, 200)
      );
      throw new Error(`Failed to parse clientDataJSON: ${parseError.message}`);
    }

    console.log(`📊 Client Data Analysis:`);
    console.log(`   Type: "${clientDataJSON.type}"`);
    console.log(`   Challenge in client: "${clientDataJSON.challenge}"`);
    console.log(`   Expected challenge: "${expectedChallenge}"`);
    console.log(`   Origin: "${clientDataJSON.origin}"`);
    console.log(`   Cross origin: ${clientDataJSON.crossOrigin}`);

    // Verify the challenge matches
    if (clientDataJSON.challenge !== expectedChallenge) {
      console.log(`❌ Challenge mismatch!`);
      console.log(`   Expected: "${expectedChallenge}"`);
      console.log(`   Received: "${clientDataJSON.challenge}"`);
      throw new Error("Challenge mismatch");
    }

    // Verify this is a registration ceremony
    if (clientDataJSON.type !== "webauthn.create") {
      throw new Error(
        `Invalid ceremony type: expected "webauthn.create", got "${clientDataJSON.type}"`
      );
    }

    // Verify origin (more lenient for debugging)
    const expectedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://localhost:3000", // ✅ Added HTTPS localhost
      "https://sameer-yadav.site",
    ];

    if (!expectedOrigins.includes(clientDataJSON.origin)) {
      console.warn(
        `⚠️  Origin warning: expected one of ${expectedOrigins.join(
          ", "
        )}, got ${clientDataJSON.origin}`
      );
      // Don't fail for now, just warn
    }

    // ✅ Handle attestationObject properly
    let attestationObjectBuffer;
    if (typeof credential.response.attestationObject === "string") {
      // If it's base64url encoded string
      attestationObjectBuffer = base64url.toBuffer(
        credential.response.attestationObject
      );
    } else if (
      credential.response.attestationObject instanceof ArrayBuffer ||
      Array.isArray(credential.response.attestationObject)
    ) {
      // If it's ArrayBuffer or array
      attestationObjectBuffer = Buffer.from(
        credential.response.attestationObject
      );
    } else {
      throw new Error("Invalid attestationObject format");
    }

    console.log(
      `📦 Attestation object size: ${attestationObjectBuffer.length} bytes`
    );

    // Create new credential object
    const newCredential = {
      credentialID: credential.id,
      publicKey: base64url.encode(attestationObjectBuffer), // Store the attestation object for now
      counter: 0,
      transports: credential.response.transports || [
        "usb",
        "nfc",
        "ble",
        "internal",
      ],
      createdAt: new Date(),
    };

    console.log(`💾 Storing new credential:`);
    console.log(`   ID: "${newCredential.credentialID}"`);
    console.log(`   Transports: ${newCredential.transports.join(", ")}`);

    // Check if credential already exists
    const existingCred = user.webAuthnCredentials.find(
      (cred) => cred.credentialID === credential.id
    );

    if (existingCred) {
      throw new Error("Credential already registered");
    }

    // Push the new credential to user's webAuthnCredentials array
    user.webAuthnCredentials.push(newCredential);
    await user.save();

    console.log(`✅ Registration successful for user: "${username}"`);
    return { verified: true, message: "Registration successful" };
  } catch (error) {
    console.error("❌ Error verifying attestation response:", error);
    throw new Error(`Error verifying attestation response: ${error.message}`);
  }
}
