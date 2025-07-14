import apiClient from "../../config/axiosConfig";

// Step 6: Verify the credential with backend
export async function verifyCredential(username, serializedCredential) {
  try {
    const response = await apiClient.post(`/webauthn-verify-login`, {
      username,
      credential: serializedCredential,
    });
    return response.data.success;
  } catch (error) {
    console.error("Credential verification error:", error);
    return false;
  }
}
