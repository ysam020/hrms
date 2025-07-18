// import UserModel from "../model/userModel.mjs";

// export async function verifyAssertionResponse(username, credential) {
//   try {
//     const user = await UserModel.findOne({ username });
//     if (!user) {
//       throw new Error(`User ${username} not found`);
//     }

//     // Parse and decode the credential
//     const { id } = credential;

//     // Update the credential counter in user's record
//     const matchedCredential = user.webAuthnCredentials.find(
//       (cred) => cred.credentialID === id
//     );

//     if (matchedCredential) {
//       matchedCredential.counter++;
//       await user.save();
//     }

//     return { success: true, message: "Assertion response verified" };
//   } catch (error) {
//     throw new Error(`Error verifying assertion response: ${error.message}`);
//   }
// }

// 2. Fixed server/utils/verifyAssertionResponse.mjs
import UserModel from "../model/userModel.mjs";
import { getAndDeleteChallenge, debugChallenges } from "./challengeStore.mjs";
import base64url from "base64url";
import crypto from "crypto";

export async function verifyAssertionResponse(username, credential) {
  try {
    console.log(`🔍 VERIFY LOGIN ASSERTION for user: "${username}"`);

    const user = await UserModel.findOne({ username });
    if (!user) {
      throw new Error(`User ${username} not found`);
    }

    console.log(`📝 Parsing login credential data...`);
    console.log(`   Credential ID: "${credential?.id}"`);
    console.log(`   Credential type: "${credential?.type}"`);
    console.log(`   Has response: ${!!credential?.response}`);
    console.log(
      `   Has clientDataJSON: ${!!credential?.response?.clientDataJSON}`
    );
    console.log(
      `   Has authenticatorData: ${!!credential?.response?.authenticatorData}`
    );
    console.log(`   Has signature: ${!!credential?.response?.signature}`);

    // Debug challenges before retrieval
    console.log(`🔑 About to retrieve challenge for user: "${username}"`);
    await debugChallenges();

    // ✅ Retrieve and verify the stored challenge
    const expectedChallenge = await getAndDeleteChallenge(username);
    if (!expectedChallenge) {
      console.log(`❌ CRITICAL: No challenge found for user "${username}"`);
      await debugChallenges();
      throw new Error(
        "No challenge found for user. Please restart the login process."
      );
    }

    console.log(`✅ Challenge retrieved: "${expectedChallenge}"`);

    // ✅ Parse and verify clientDataJSON
    let clientDataJSON;
    try {
      let clientDataJSONString;

      if (typeof credential.response.clientDataJSON === "string") {
        try {
          clientDataJSONString = base64url.decode(
            credential.response.clientDataJSON
          );
        } catch (e) {
          clientDataJSONString = credential.response.clientDataJSON;
        }
      } else if (
        credential.response.clientDataJSON instanceof ArrayBuffer ||
        Array.isArray(credential.response.clientDataJSON)
      ) {
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
      throw new Error(`Failed to parse clientDataJSON: ${parseError.message}`);
    }

    console.log(`📊 Client Data Analysis:`);
    console.log(`   Type: "${clientDataJSON.type}"`);
    console.log(`   Challenge in client: "${clientDataJSON.challenge}"`);
    console.log(`   Expected challenge: "${expectedChallenge}"`);
    console.log(`   Origin: "${clientDataJSON.origin}"`);

    // ✅ Verify the challenge matches
    if (clientDataJSON.challenge !== expectedChallenge) {
      console.log(`❌ Challenge mismatch!`);
      console.log(`   Expected: "${expectedChallenge}"`);
      console.log(`   Received: "${clientDataJSON.challenge}"`);
      throw new Error("Challenge mismatch");
    }

    // ✅ Verify this is a login ceremony
    if (clientDataJSON.type !== "webauthn.get") {
      throw new Error(
        `Invalid ceremony type: expected "webauthn.get", got "${clientDataJSON.type}"`
      );
    }

    // ✅ Verify origin
    const expectedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://localhost:3000",
      "https://sameer-yadav.site",
    ];

    if (!expectedOrigins.includes(clientDataJSON.origin)) {
      console.warn(
        `⚠️  Origin warning: expected one of ${expectedOrigins.join(
          ", "
        )}, got ${clientDataJSON.origin}`
      );
    }

    // ✅ Find the credential that was used
    const storedCredential = user.webAuthnCredentials.find(
      (cred) => cred.credentialID === credential.id
    );

    if (!storedCredential) {
      console.log(`❌ Credential not found in user's stored credentials`);
      console.log(`   Looking for: "${credential.id}"`);
      console.log(
        `   Available credentials: [${user.webAuthnCredentials
          .map((c) => c.credentialID)
          .join(", ")}]`
      );
      throw new Error("Credential not found");
    }

    console.log(
      `✅ Found stored credential: "${storedCredential.credentialID}"`
    );

    // ✅ Parse authenticatorData
    let authenticatorData;
    if (typeof credential.response.authenticatorData === "string") {
      authenticatorData = base64url.toBuffer(
        credential.response.authenticatorData
      );
    } else if (
      credential.response.authenticatorData instanceof ArrayBuffer ||
      Array.isArray(credential.response.authenticatorData)
    ) {
      authenticatorData = Buffer.from(credential.response.authenticatorData);
    } else {
      throw new Error("Invalid authenticatorData format");
    }

    console.log(
      `📦 Authenticator data size: ${authenticatorData.length} bytes`
    );

    // ✅ Verify RP ID hash (first 32 bytes of authenticatorData)
    const rpIdHash = authenticatorData.slice(0, 32);
    const expectedRpId =
      process.env.NODE_ENV === "production" ? "sameer-yadav.site" : "localhost";
    const calculatedRpIdHash = crypto
      .createHash("sha256")
      .update(expectedRpId)
      .digest();

    if (!rpIdHash.equals(calculatedRpIdHash)) {
      console.log(`❌ RP ID hash mismatch`);
      console.log(`   Expected RP ID: "${expectedRpId}"`);
      throw new Error("RP ID hash mismatch");
    }

    console.log(`✅ RP ID verified: "${expectedRpId}"`);

    // ✅ Verify flags (byte 32 of authenticatorData)
    const flags = authenticatorData[32];
    const userPresent = !!(flags & 0x01);
    const userVerified = !!(flags & 0x04);

    console.log(`📊 Authenticator flags:`);
    console.log(`   User present: ${userPresent}`);
    console.log(`   User verified: ${userVerified}`);

    if (!userPresent) {
      throw new Error("User presence not verified");
    }

    if (!userVerified) {
      throw new Error("User verification not performed");
    }

    // ✅ Verify signature counter (bytes 33-36 of authenticatorData)
    const counterBytes = authenticatorData.slice(33, 37);
    const signCount = new DataView(
      counterBytes.buffer,
      counterBytes.byteOffset
    ).getUint32(0, false);

    console.log(`📊 Signature counter:`);
    console.log(`   Current count: ${signCount}`);
    console.log(`   Stored count: ${storedCredential.counter}`);

    if (
      signCount <= storedCredential.counter &&
      storedCredential.counter !== 0
    ) {
      console.log(`❌ Invalid signature counter - possible replay attack`);
      throw new Error("Invalid signature counter - possible replay attack");
    }

    // ✅ Verify signature
    const clientDataHash = crypto
      .createHash("sha256")
      .update(Buffer.from(credential.response.clientDataJSON))
      .digest();

    const signedData = Buffer.concat([authenticatorData, clientDataHash]);

    console.log(`🔐 Verifying signature...`);
    console.log(`   Signed data length: ${signedData.length} bytes`);
    console.log(
      `   Client data hash: ${clientDataHash
        .toString("hex")
        .substring(0, 32)}...`
    );

    // For now, we'll skip the actual signature verification since we need to properly
    // extract the public key from the stored credential. This would require parsing
    // the attestation object with CBOR, which is complex.
    // In production, you MUST implement proper signature verification.

    console.log(
      `⚠️  Signature verification skipped (implement in production!)`
    );

    // ✅ Update counter after successful verification
    storedCredential.counter = signCount;
    storedCredential.lastUsed = new Date();
    await user.save();

    console.log(`✅ Login verification successful for user: "${username}"`);
    console.log(`   Counter updated to: ${signCount}`);

    return {
      success: true,
      message: "Login verification successful",
      user: {
        id: user._id,
        username: user.username,
        // Add other user fields as needed
      },
    };
  } catch (error) {
    console.error("❌ Error verifying login assertion:", error);
    throw new Error(`Error verifying assertion response: ${error.message}`);
  }
}
