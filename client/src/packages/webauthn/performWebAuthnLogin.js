import apiClient from "../../config/axiosConfig";
import { toArrayBuffer } from "./toArrayBuffer";

export async function performWebAuthnLogin(
  username,
  setAlert,
  onFallbackToPassword
) {
  try {
    // Step 1: Get login options from server (includes all validation)
    const optionsResponse = await apiClient.post("/webauthn-login-options", {
      username,
    });

    const options = optionsResponse.data;

    // Check if we need to fallback to password login
    if (options.fallbackToPassword) {
      if (onFallbackToPassword) {
        onFallbackToPassword(options.isTwoFactorEnabled);
      }
      return {
        success: false,
        fallbackToPassword: true,
        isTwoFactorEnabled: options.isTwoFactorEnabled,
        message: "WebAuthn not available, using password login",
      };
    }

    // Step 2: Format options for WebAuthn API
    const publicKeyCredentialRequestOptions = {
      challenge: toArrayBuffer(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout || 60000,
      userVerification: options.userVerification || "required",
      allowCredentials: options.allowCredentials.map((cred) => ({
        type: cred.type,
        id: toArrayBuffer(cred.id),
        transports: cred.transports || ["usb", "nfc", "ble", "internal"],
      })),
    };

    // Step 3: Get assertion from authenticator
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    });

    if (!assertion) {
      throw new Error("No assertion received from authenticator");
    }

    // Step 4: Format credential for server transmission
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

    // Step 5: Verify credential (this consumes the challenge)
    const verifyResponse = await apiClient.post("/webauthn-verify-login", {
      username,
      credential,
    });

    if (!verifyResponse.data.success) {
      throw new Error(
        verifyResponse.data.message || "Login verification failed"
      );
    }

    // Get geolocation if needed
    let geolocation = { latitude: null, longitude: null };
    try {
      if (navigator.geolocation) {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
          });
        });
        geolocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      }
    } catch (geoError) {
      console.warn("Could not get geolocation:", geoError.message);
    }

    // Complete login with session creation
    const loginResponse = await apiClient.post("/webauthn-login", {
      username,
      credential,
      geolocation,
      userAgent: navigator.userAgent,
    });

    if (loginResponse.data.message === "Login successful") {
      setAlert({
        open: true,
        message: "Login successful!",
        severity: "success",
      });

      return {
        success: true,
        user: loginResponse.data.user,
        data: loginResponse.data,
      };
    } else {
      throw new Error(loginResponse.data.message || "Session creation failed");
    }
  } catch (error) {
    console.error("WebAuthn login error:", error);

    let errorMessage = "WebAuthn login failed";
    let shouldFallbackToPassword = false;

    // Handle specific server errors
    if (error.response && error.response.data) {
      const serverError = error.response.data;

      if (serverError.fallbackToPassword) {
        shouldFallbackToPassword = true;
        if (onFallbackToPassword) {
          onFallbackToPassword(serverError.isTwoFactorEnabled);
        }
        return {
          success: false,
          fallbackToPassword: true,
          isTwoFactorEnabled: serverError.isTwoFactorEnabled,
          message: serverError.message || "Falling back to password login",
        };
      }

      errorMessage = serverError.message || errorMessage;
    } else if (error.name === "NotAllowedError") {
      errorMessage = "Authentication was cancelled or timed out";
    } else if (error.name === "InvalidStateError") {
      errorMessage = "Authenticator is in an invalid state";
    } else if (error.name === "NotSupportedError") {
      errorMessage = "WebAuthn is not supported by this browser";
    } else if (error.message) {
      errorMessage = error.message;
    }

    setAlert({
      open: true,
      message: errorMessage,
      severity: "error",
    });

    return {
      success: false,
      error: errorMessage,
      fallbackToPassword: shouldFallbackToPassword,
    };
  }
}
