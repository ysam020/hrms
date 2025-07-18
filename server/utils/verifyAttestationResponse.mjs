import UserModel from "../model/userModel.mjs";
import { getAndDeleteChallenge } from "./challengeStore.mjs";
import base64url from "base64url";

export async function verifyAttestationResponse(username, credential) {
  try {
    const user = await UserModel.findOne({ username });
    if (!user) {
      throw new Error(`User ${username} not found`);
    }

    // Retrieve and verify the stored challenge
    const expectedChallenge = await getAndDeleteChallenge(username);
    if (!expectedChallenge) {
      throw new Error(
        "No challenge found for user. Please restart the registration process."
      );
    }

    // Parse and verify clientDataJSON
    let clientDataJSON;
    try {
      // The clientDataJSON comes from the client as base64url encoded
      // We need to decode it first, then parse as JSON
      let clientDataJSONString;

      if (typeof credential.response.clientDataJSON === "string") {
        // If it's a string, try base64url decode
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

      clientDataJSON = JSON.parse(clientDataJSONString);
    } catch (parseError) {
      throw new Error(`Failed to parse clientDataJSON: ${parseError.message}`);
    }

    // Verify the challenge matches
    if (clientDataJSON.challenge !== expectedChallenge) {
      throw new Error("Challenge mismatch");
    }

    // Verify this is a registration ceremony
    if (clientDataJSON.type !== "webauthn.create") {
      throw new Error(
        `Invalid ceremony type: expected "webauthn.create", got "${clientDataJSON.type}"`
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

    // Handle attestationObject
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

    // Create new credential object
    const newCredential = {
      credentialID: credential.id,
      publicKey: base64url.encode(attestationObjectBuffer), // Store the attestation object
      counter: 0,
      transports: credential.response.transports || [
        "usb",
        "nfc",
        "ble",
        "internal",
      ],
      createdAt: new Date(),
    };

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

    return { verified: true, message: "Registration successful" };
  } catch (error) {
    console.error("Error verifying attestation response:", error);
    throw new Error(`Error verifying attestation response: ${error.message}`);
  }
}
