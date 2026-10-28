import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import {
  updateFaviconWithDot,
  updateDocumentTitle,
} from "@web/shared/utils/faviconUtils";

type AlertFn = (alert: {
  open: boolean;
  message: string;
  severity: string;
}) => void;

function credentialIdToArrayBuffer(
  id: string | ArrayBuffer | { type: string; data: number[] } | number[],
) {
  if (id instanceof ArrayBuffer) {
    return id;
  }

  if (
    id &&
    typeof id === "object" &&
    (id as any).type === "Buffer" &&
    Array.isArray((id as any).data)
  ) {
    // Handle Buffer object from server
    return new Uint8Array((id as any).data).buffer;
  }

  if (Array.isArray(id)) {
    return new Uint8Array(id).buffer;
  }

  if (typeof id === "string") {
    return Uint8Array.from(
      atob(id.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    ).buffer;
  }

  throw new Error(`Invalid credential ID format: ${typeof id}`);
}

export async function performWebAuthnLogin(
  username: string,
  options: any,
  processLogin: (user: unknown) => void,
  handleLoginError: (error: unknown) => void,
  setAlert: AlertFn,
) {
  try {
    const updateFaviconAfterLogin = async () => {
      try {
        const res = await apiClient(API_ENDPOINTS.GET_NOTIFICATIONS);
        const notifications = res.data || [];
        updateFaviconWithDot(notifications.length > 0);
        updateDocumentTitle(notifications.length);
      } catch (error) {
        console.error("Error fetching notifications after login:", error);
        updateFaviconWithDot(false);
        updateDocumentTitle(0);
      }
    };

    if (!options || !options.challenge) {
      throw new Error("Invalid authentication options received from server");
    }

    const challenge = Uint8Array.from(
      atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );

    const allowCredentials =
      options.allowCredentials?.map((cred: any) => ({
        ...cred,
        id: credentialIdToArrayBuffer(cred.id),
      })) || [];

    const publicKeyCredentialRequestOptions = {
      challenge: challenge,
      rpId: options.rpId,
      timeout: options.timeout || 60000,
      userVerification: options.userVerification || "required",
      allowCredentials: allowCredentials,
    };

    if (allowCredentials.length === 0) {
      throw new Error("No valid credentials available for authentication");
    }

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    });

    if (!assertion) {
      throw new Error("No assertion received from authenticator");
    }

    const pkAssertion = assertion as PublicKeyCredential;
    const pkResponse = pkAssertion.response as AuthenticatorAssertionResponse;
    const credential = {
      id: pkAssertion.id,
      type: pkAssertion.type,
      response: {
        authenticatorData: Array.from(
          new Uint8Array(pkResponse.authenticatorData),
        ),
        clientDataJSON: Array.from(new Uint8Array(pkResponse.clientDataJSON)),
        signature: Array.from(new Uint8Array(pkResponse.signature)),
        userHandle: pkResponse.userHandle
          ? Array.from(new Uint8Array(pkResponse.userHandle))
          : null,
      },
    };

    try {
      const verifyResponse = await apiClient.post(
        API_ENDPOINTS.WEBAUTHN_VERIFY_LOGIN,
        {
          username,
          credential,
        },
      );

      if (!verifyResponse.data.success && !verifyResponse.data.verified) {
        throw new Error(
          verifyResponse.data.message || "Login verification failed",
        );
      }

      let geolocation: { latitude: number | null; longitude: number | null } = {
        latitude: null,
        longitude: null,
      };
      try {
        if (navigator.geolocation) {
          const position = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 5000,
              });
            },
          );
          geolocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
        }
      } catch (geoError) {}

      const tempToken = verifyResponse.data.data?.tempToken;

      // Complete login — exchange temp token for JWT
      const loginResponse = await apiClient.post(API_ENDPOINTS.WEBAUTHN_LOGIN, {
        tempToken,
        geolocation,
        userAgent: navigator.userAgent,
      });

      if (loginResponse.data.success) {
        setAlert({
          open: true,
          message: "Login successful!",
          severity: "success",
        });

        processLogin(loginResponse.data.data.user);
        await updateFaviconAfterLogin();

        return {
          success: true,
          user: loginResponse.data.data.user,
          ...loginResponse.data.data,
        };
      } else {
        throw new Error(loginResponse.data.message || "Login failed");
      }
    } catch (verifyError: any) {
      console.error("Verification failed:", verifyError);
      handleLoginError(verifyError);
      throw new Error(
        verifyError.response?.data?.message ||
          verifyError.message ||
          "Authentication verification failed",
      );
    }
  } catch (error: any) {
    console.error("WebAuthn login failed:", error);

    if (error.name === "NotAllowedError") {
      handleLoginError(
        new Error(
          "Authentication was cancelled or timed out. Please try again.",
        ),
      );
    } else if (error.name === "SecurityError") {
      handleLoginError(
        new Error(
          "Security error during authentication. Please ensure you're on a secure connection.",
        ),
      );
    } else if (error.name === "AbortError") {
      handleLoginError(
        new Error("Authentication was aborted. Please try again."),
      );
    } else if (error.name === "NotSupportedError") {
      handleLoginError(
        new Error("WebAuthn is not supported on this device or browser."),
      );
    } else if (error.name === "InvalidStateError") {
      handleLoginError(
        new Error(
          "Invalid authentication state. Please refresh and try again.",
        ),
      );
    } else {
      handleLoginError(error);
    }

    return {
      success: false,
      error: error.message,
    };
  }
}
