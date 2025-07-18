// import apiClient from "../../config/axiosConfig";

// export const verifyWebauthnRegistration = async (credential, setAlert) => {
//   try {
//     const res = await apiClient.post(`/webauthn-verify-registration`, {
//       credential,
//     });
//     if (res.data.verified) {
//       setAlert({
//         open: true,
//         message: "Registration successful!",
//         severity: "success",
//       });
//     } else {
//       setAlert({
//         open: true,
//         message: "Registration failed. Please try again.",
//         severity: "error",
//       });
//     }
//   } catch (error) {
//     setAlert({
//       open: true,
//       message: error.response.data.message,
//       severity: "error",
//     });
//   }
// };

import apiClient from "../../config/axiosConfig";

export const verifyWebauthnRegistration = async (credential, setAlert) => {
  try {
    console.log("🔐 Sending credential for verification:", {
      id: credential.id,
      type: credential.type,
      responseKeys: Object.keys(credential.response),
    });

    // ✅ Ensure proper format for sending to server
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

    console.log("📤 Credential data being sent:", {
      clientDataJSONType: typeof credentialForServer.response.clientDataJSON,
      attestationObjectType:
        typeof credentialForServer.response.attestationObject,
      clientDataJSONLength: credentialForServer.response.clientDataJSON?.length,
      attestationObjectLength:
        credentialForServer.response.attestationObject?.length,
    });

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
