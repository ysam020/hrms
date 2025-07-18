import apiClient from "../../config/axiosConfig";

export async function checkWebAuthnCredentials(username) {
  try {
    const response = await apiClient.post("/webauthn-credential-check", {
      username,
    });

    return {
      success: true,
      hasCredentials: response.data.hasCredentials,
      isTwoFactorEnabled: response.data.isTwoFactorEnabled,
    };
  } catch (error) {
    console.error("Credential check error:", error);

    if (error.response && error.response.data) {
      return {
        success: false,
        message: error.response.data.message,
        hasCredentials: false,
        isTwoFactorEnabled: false,
      };
    }

    return {
      success: false,
      message: "Unable to check credentials",
      hasCredentials: false,
      isTwoFactorEnabled: false,
    };
  }
}
