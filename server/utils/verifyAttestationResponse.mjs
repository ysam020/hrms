import UserModel from "../model/userModel.mjs";
import base64url from "base64url";

export async function verifyAttestationResponse(username, credential) {
  try {
    const user = await UserModel.findOne({ username });
    if (!user) {
      throw new Error(`User ${username} not found`);
    }

    // Convert clientDataJSON and attestationObject from arrays of bytes to buffers
    const clientDataJSONBuffer = Buffer.from(
      credential.response.clientDataJSON
    );

    const attestationObjectBuffer = Buffer.from(
      credential.response.attestationObject
    );

    // Decode clientDataJSON and attestationObject buffers to base64url strings
    const clientDataJSONString = base64url.encode(clientDataJSONBuffer);
    const attestationObjectString = base64url.encode(attestationObjectBuffer);

    if (!clientDataJSONString || !attestationObjectString) {
      throw new Error("Invalid attestation response data");
    }

    // Update credential information in user's record
    const newCredential = {
      credentialID: credential.id,
      publicKey: credential.response.publicKey,
      counter: 0,
    };

    // Push the new credential to user's webAuthnCredentials array
    user.webAuthnCredentials.push(newCredential);
    await user.save();

    return { verified: true, message: "Registration successful" };
  } catch (error) {
    console.error("Error verifying attestation response:", error);
    throw new Error(`Error verifying attestation response: ${error.message}`);
  }
}
