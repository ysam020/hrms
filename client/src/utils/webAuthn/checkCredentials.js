import apiClient from "../../config/axiosConfig";

export async function checkCredentials(username) {
  try {
    const response = await apiClient.post(`/webauthn-credential-check`, {
      username,
    });

    return response.data;
  } catch (error) {
    console.error("Credential check error:", error);

    // Handle server errors and return structured response
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
