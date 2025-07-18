import apiClient from "../../config/axiosConfig";

export const verifyWebauthnRegistration = async (credential, setAlert) => {
  try {
    // Format credential before sending to server
    const credentialForServer = {
      id: credential.id,
      rawId: credential.rawId,
      type: credential.type,
      response: {
        clientDataJSON: credential.response.clientDataJSON,
        attestationObject: credential.response.attestationObject,
        transports: credential.response.getTransports
          ? credential.response.getTransports()
          : undefined,
      },
    };

    // Convert ArrayBuffers to appropriate format for transmission
    if (credentialForServer.response.clientDataJSON instanceof ArrayBuffer) {
      credentialForServer.response.clientDataJSON = Array.from(
        new Uint8Array(credentialForServer.response.clientDataJSON)
      );
    }

    if (credentialForServer.response.attestationObject instanceof ArrayBuffer) {
      credentialForServer.response.attestationObject = Array.from(
        new Uint8Array(credentialForServer.response.attestationObject)
      );
    }

    const res = await apiClient.post(`/webauthn-verify-registration`, {
      credential: credentialForServer,
    });

    if (res.data.verified) {
      setAlert({
        open: true,
        message: "Registration successful!",
        severity: "success",
      });
    } else {
      setAlert({
        open: true,
        message: "Registration failed. Please try again.",
        severity: "error",
      });
    }
  } catch (error) {
    console.error("❌ Registration verification error:", error);
    setAlert({
      open: true,
      message: error.response?.data?.message || error.message,
      severity: "error",
    });
  }
};
