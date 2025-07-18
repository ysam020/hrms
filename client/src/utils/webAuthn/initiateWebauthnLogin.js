import apiClient from "../../config/axiosConfig";
import base64url from "base64url";

export async function initiateWebauthnLogin(username, setAlert) {
  try {
    console.log(`🔐 Starting WebAuthn login for: ${username}`);

    // Get assertion options from server
    const optionsResponse = await apiClient.post("/webauthn-login-options", {
      username,
    });

    if (optionsResponse.data.error) {
      setAlert(optionsResponse.data.message, "error");
      return { success: false, error: optionsResponse.data.message };
    }

    const options = optionsResponse.data;

    // Format options for WebAuthn API
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

    // Get assertion from authenticator
    const assertion = await navigator.credentials.get({
      publicKey: formattedOptions,
    });

    if (!assertion) {
      throw new Error("No assertion received from authenticator");
    }

    // Format credential for server
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

    // Send to server for verification
    const verifyResponse = await apiClient.post("/webauthn-verify-login", {
      username,
      credential,
    });

    if (verifyResponse.data.success) {
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
    console.error("WebAuthn login error:", error);

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
