import UserModel from "../model/userModel.mjs";

export async function verifyAssertionResponse(username, credential) {
  try {
    const user = await UserModel.findOne({ username });
    if (!user) {
      throw new Error(`User ${username} not found`);
    }

    // Parse and decode the credential
    const { id } = credential;

    // Update the credential counter in user's record
    const matchedCredential = user.webAuthnCredentials.find(
      (cred) => cred.credentialID === id
    );

    if (matchedCredential) {
      matchedCredential.counter++;
      await user.save();
    }

    return { success: true, message: "Assertion response verified" };
  } catch (error) {
    throw new Error(`Error verifying assertion response: ${error.message}`);
  }
}
