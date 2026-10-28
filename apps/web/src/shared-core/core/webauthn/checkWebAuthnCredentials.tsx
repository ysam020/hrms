import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

export async function checkWebAuthnCredentials(username: string) {
  try {
    const response = await apiClient.post(
      API_ENDPOINTS.WEBAUTHN_CREDENTIAL_CHECK,
      {
        username,
      },
    );

    return {
      success: true,
      hasCredentials: response.data.hasCredentials,
    };
  } catch (error: any) {
    console.error("Credential check error:", error);

    if (error.response && error.response.data) {
      return {
        success: false,
        message: error.response.data.message,
        hasCredentials: false,
      };
    }

    return {
      success: false,
      message: "Unable to check credentials",
      hasCredentials: false,
    };
  }
}
