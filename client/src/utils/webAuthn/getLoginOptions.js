import apiClient from "../../config/axiosConfig";

// Step 2: Retrieve WebAuthn login options
export async function getLoginOptions(username) {
  try {
    const response = await apiClient.post(`/webauthn-login-options`, {
      username,
    });
    return response.data;
  } catch (error) {
    console.error("Login options error:", error);
    return null;
  }
}
