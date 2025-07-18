// import apiClient from "../../config/axiosConfig";
// import { formatLoginOptions } from "./formatLoginOptions";

// export async function initiateWebauthnLogin(username, setAlert) {
//   try {
//     // ✅ Get assertion options
//     const optionsResponse = await apiClient.post("/webauthn-login-options", {
//       username,
//     });

//     if (optionsResponse.data.error) {
//       setAlert(optionsResponse.data.message, "error");
//       return false;
//     }

//     // ✅ Format options for WebAuthn API
//     const formattedOptions = formatLoginOptions(optionsResponse.data);

//     // ✅ Get assertion from authenticator
//     const assertion = await navigator.credentials.get({
//       publicKey: formattedOptions,
//     });

//     // ✅ Convert ArrayBuffers to base64url for transmission
//     const credential = {
//       id: assertion.id,
//       rawId: base64url.encode(assertion.rawId),
//       response: {
//         authenticatorData: base64url.encode(
//           assertion.response.authenticatorData
//         ),
//         clientDataJSON: base64url.encode(assertion.response.clientDataJSON),
//         signature: base64url.encode(assertion.response.signature),
//         userHandle: assertion.response.userHandle
//           ? base64url.encode(assertion.response.userHandle)
//           : null,
//       },
//       type: assertion.type,
//     };

//     // ✅ Send to server for verification and login
//     const loginResponse = await apiClient.post("/auth/webauthn-login", {
//       username,
//       credential,
//       geolocation: {
//         latitude: null, // Get from navigator.geolocation if needed
//         longitude: null,
//       },
//       userAgent: navigator.userAgent,
//     });

//     if (loginResponse.status === 200) {
//       setAlert("Login successful!", "success");
//       return true;
//     }
//   } catch (error) {
//     console.error("WebAuthn login error:", error);
//     setAlert("Login failed: " + error.message, "error");
//     return false;
//   }
// }

import apiClient from "../../config/axiosConfig";
import base64url from "base64url";

export async function initiateWebauthnLogin(username, setAlert) {
  try {
    console.log(`🔐 Starting WebAuthn login for: ${username}`);

    // ✅ Get assertion options from server
    const optionsResponse = await apiClient.post("/webauthn-login-options", {
      username,
    });

    if (optionsResponse.data.error) {
      setAlert(optionsResponse.data.message, "error");
      return { success: false, error: optionsResponse.data.message };
    }

    const options = optionsResponse.data;
    console.log(`✅ Received login options:`, {
      challenge: options.challenge?.substring(0, 20) + "...",
      allowCredentials: options.allowCredentials?.length,
      rpId: options.rpId,
    });

    // ✅ Format options for WebAuthn API
    const formattedOptions = {
      ...options,
      challenge: base64url.toBuffer(options.challenge),
      allowCredentials: options.allowCredentials.map((cred) => ({
        ...cred,
        id:
          typeof cred.id === "string"
            ? base64url.toBuffer(cred.id)
            : new Uint8Array(cred.id),
      })),
    };

    console.log(`🔑 Requesting assertion from authenticator...`);

    // ✅ Get assertion from authenticator
    const assertion = await navigator.credentials.get({
      publicKey: formattedOptions,
    });

    if (!assertion) {
      throw new Error("No assertion received from authenticator");
    }

    console.log(`✅ Assertion received:`, {
      id: assertion.id,
      type: assertion.type,
    });

    // ✅ Format credential for server
    const credential = {
      id: assertion.id,
      rawId: assertion.rawId,
      type: assertion.type,
      response: {
        authenticatorData: Array.from(
          new Uint8Array(assertion.response.authenticatorData)
        ),
        clientDataJSON: Array.from(
          new Uint8Array(assertion.response.clientDataJSON)
        ),
        signature: Array.from(new Uint8Array(assertion.response.signature)),
        userHandle: assertion.response.userHandle
          ? Array.from(new Uint8Array(assertion.response.userHandle))
          : null,
      },
    };

    console.log(`📤 Sending credential for verification...`);

    // ✅ Send to server for verification
    const verifyResponse = await apiClient.post("/webauthn-verify-login", {
      username,
      credential,
    });

    if (verifyResponse.data.success) {
      console.log(`✅ WebAuthn login successful!`);
      setAlert("Login successful!", "success");
      return {
        success: true,
        user: verifyResponse.data.user,
        credential: credential,
      };
    } else {
      throw new Error(
        verifyResponse.data.message || "Login verification failed"
      );
    }
  } catch (error) {
    console.error("❌ WebAuthn login error:", error);

    let errorMessage = "WebAuthn login failed";

    if (error.name === "NotAllowedError") {
      errorMessage = "Authentication was cancelled or timed out";
    } else if (error.name === "InvalidStateError") {
      errorMessage = "Authenticator is already registered";
    } else if (error.name === "NotSupportedError") {
      errorMessage = "WebAuthn is not supported by this browser";
    } else if (error.message) {
      errorMessage = error.message;
    }

    setAlert(errorMessage, "error");
    return { success: false, error: errorMessage };
  }
}
