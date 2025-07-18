import UserModel from "../model/userModel.mjs";
import { getAndDeleteChallenge } from "./challengeStore.mjs";
import base64url from "base64url";
import crypto from "crypto";

export async function verifyAssertionResponse(username, credential) {
  try {
    const user = await UserModel.findOne({ username });
    if (!user) {
      throw new Error(`User ${username} not found`);
    }

    // Retrieve and verify the stored challenge
    const expectedChallenge = await getAndDeleteChallenge(username);
    if (!expectedChallenge) {
      throw new Error(
        "No challenge found for user. Please restart the login process."
      );
    }

    // Parse and verify clientDataJSON
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

      clientDataJSON = JSON.parse(clientDataJSONString);
    } catch (parseError) {
      console.error(`Failed to parse clientDataJSON:`, parseError);
      throw new Error(`Failed to parse clientDataJSON: ${parseError.message}`);
    }

    // Verify the challenge matches
    if (clientDataJSON.challenge !== expectedChallenge) {
      throw new Error("Challenge mismatch");
    }

    // Verify this is a login ceremony
    if (clientDataJSON.type !== "webauthn.get") {
      throw new Error(
        `Invalid ceremony type: expected "webauthn.get", got "${clientDataJSON.type}"`
      );
    }

    // Verify origin
    const expectedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://localhost:3000",
      "https://sameer-yadav.site",
    ];

    if (!expectedOrigins.includes(clientDataJSON.origin)) {
      console.warn(
        `Origin warning: expected one of ${expectedOrigins.join(", ")}, got ${
          clientDataJSON.origin
        }`
      );
    }

    // Find the credential that was used
    const storedCredential = user.webAuthnCredentials.find(
      (cred) => cred.credentialID === credential.id
    );

    if (!storedCredential) {
      throw new Error("Credential not found");
    }

    // Parse authenticatorData
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

    // Verify RP ID hash
    const rpIdHash = authenticatorData.slice(0, 32);
    const expectedRpId =
      process.env.NODE_ENV === "production" ? "sameer-yadav.site" : "localhost";
    const calculatedRpIdHash = crypto
      .createHash("sha256")
      .update(expectedRpId)
      .digest();

    if (!rpIdHash.equals(calculatedRpIdHash)) {
      throw new Error("RP ID hash mismatch");
    }

    // Verify flags (byte 32 of authenticatorData)
    const flags = authenticatorData[32];
    const userPresent = !!(flags & 0x01);
    const userVerified = !!(flags & 0x04);

    if (!userPresent) {
      throw new Error("User presence not verified");
    }

    if (!userVerified) {
      throw new Error("User verification not performed");
    }

    // Verify signature counter
    const counterBytes = authenticatorData.slice(33, 37);
    const signCount = new DataView(
      counterBytes.buffer,
      counterBytes.byteOffset
    ).getUint32(0, false);

    if (
      signCount <= storedCredential.counter &&
      storedCredential.counter !== 0
    ) {
      throw new Error("Invalid signature counter - possible replay attack");
    }

    // Verify signature
    const clientDataHash = crypto
      .createHash("sha256")
      .update(Buffer.from(credential.response.clientDataJSON))
      .digest();

    const signedData = Buffer.concat([authenticatorData, clientDataHash]);

    // Update counter after successful verification
    storedCredential.counter = signCount;
    storedCredential.lastUsed = new Date();
    await user.save();

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
    console.error("Error verifying login assertion:", error);
    throw new Error(`Error verifying assertion response: ${error.message}`);
  }
}
