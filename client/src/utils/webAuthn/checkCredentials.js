import apiClient from "../../config/axiosConfig";

// Step 1: Check if WebAuthn credentials exist
export async function checkCredentials(username) {
  try {
    const response = await apiClient.post(`/webauthn-credential-check`, {
      username,
    });

    return response.data;
  } catch (error) {
    console.error("Credential check error:", error);

    // Handle server errors (404, 403, etc.) and return structured response
    if (error.response && error.response.data && error.response.data.message) {
      return {
        message: error.response.data.message,
        isServerError: true,
        hasCredentials: false,
        isTwoFactorEnabled: false,
      };
    }

    // Handle other unknown or network errors
    return {
      message: "Unable to reach server. Please try again.",
      isServerError: true,
      hasCredentials: false,
      isTwoFactorEnabled: false,
    };
  }
}
