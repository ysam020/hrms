// OPTION 1: Use Direct Verification (Recommended)
// Updated client/src/utils/webAuthn/webauthnLogin.js
import apiClient from "../../config/axiosConfig";
import { toArrayBuffer } from "./base64urlUtils.js";

export async function performWebAuthnLogin(
  username,
  setAlert,
  processLogin,
  handleLoginError
) {
  try {
    console.log(`🔐 Starting WebAuthn login for: ${username}`);

    // Step 1: Get login options from server
    console.log("📡 Requesting login options...");
    const optionsResponse = await apiClient.post("/webauthn-login-options", {
      username,
    });

    if (optionsResponse.data.error) {
      throw new Error(optionsResponse.data.message);
    }

    const options = optionsResponse.data;
    console.log("✅ Received login options");

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

    console.log("🔑 Requesting assertion from authenticator...");

    // Step 3: Get assertion from authenticator
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    });

    if (!assertion) {
      throw new Error("No assertion received from authenticator");
    }

    console.log("✅ Assertion received");

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

    console.log("📤 Verifying credential...");

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

    console.log("✅ Credential verified successfully");

    // Step 6: Complete login using the existing login endpoint (with geolocation)
    console.log("🔐 Completing login session...");

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

    // ✅ Use the existing login endpoint that handles sessions properly
    const loginResponse = await apiClient.post("/webauthn-login", {
      username,
      credential,
      geolocation,
      userAgent: navigator.userAgent,
    });

    if (loginResponse.data.message === "Login successful") {
      console.log("✅ WebAuthn login completed successfully!");
      setAlert({
        open: true,
        message: "Login successful!",
        severity: "success",
      });

      // Call your existing success handlers
      if (processLogin) {
        processLogin(loginResponse.data);
      }

      return {
        success: true,
        user: loginResponse.data.user,
        data: loginResponse.data,
      };
    } else {
      throw new Error(loginResponse.data.message || "Login completion failed");
    }
  } catch (error) {
    console.error("❌ WebAuthn login error:", error);

    let errorMessage = "WebAuthn login failed";

    if (error.name === "NotAllowedError") {
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

    // Call error handler if provided
    if (handleLoginError) {
      handleLoginError(error);
    }

    return { success: false, error: errorMessage };
  }
}

// ===================================================

// OPTION 2: Fix Passport Strategy to NOT re-verify

// ===================================================

// OPTION 3: Alternative - Store verification result temporarily
// server/utils/challengeStore.mjs (ADD to existing file)

// ===================================================

// Updated server/controllers/webauthn/verifyLogin.mjs (if using Option 3)
