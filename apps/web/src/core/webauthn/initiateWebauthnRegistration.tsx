import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { urlBase64ToUint8Array } from "./urlBase64ToUint8Array";
import { verifyWebauthnRegistration } from "./verifyWebauthnRegistration";

type AlertFn = (alert: {
  open: boolean;
  message: string;
  severity: string;
}) => void;

export async function initiateWebauthnRegistration(setAlert: AlertFn) {
  try {
    if (!window.PublicKeyCredential) {
      setAlert({
        open: true,
        message: "WebAuthn is not supported in this browser",
        severity: "error",
      });
      return;
    }

    const isAvailable =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

    if (!isAvailable) {
      setAlert({
        open: true,
        message:
          "No biometric authenticator available. Please ensure Touch ID, Face ID, or Windows Hello is set up.",
        severity: "warning",
      });
    }

    const registrationOptionsRes = await apiClient(
      API_ENDPOINTS.REGISTER_WEBAUTHN,
    );

    // Extract the options
    const actualOptions =
      registrationOptionsRes.data.data || registrationOptionsRes.data;

    const challenge = urlBase64ToUint8Array(actualOptions.challenge);
    const userId = urlBase64ToUint8Array(actualOptions.user.id);

    // Handle excludeCredentials
    let excludeCredentials: any[] = [];
    if (
      actualOptions.excludeCredentials &&
      Array.isArray(actualOptions.excludeCredentials)
    ) {
      excludeCredentials = actualOptions.excludeCredentials
        .map((cred: any) => {
          try {
            if (!cred.id || typeof cred.id !== "string") {
              return null;
            }
            const credentialIdBuffer = urlBase64ToUint8Array(cred.id);
            return {
              type: "public-key",
              id: credentialIdBuffer,
              transports: cred.transports || ["usb", "nfc", "ble", "internal"],
            };
          } catch (error: any) {
            console.warn(`Error converting credential ID: ${error.message}`);
            return null;
          }
        })
        .filter(Boolean);
    }

    const publicKeyOptions = {
      ...actualOptions,
      challenge,
      user: {
        ...actualOptions.user,
        id: userId,
      },
      excludeCredentials: excludeCredentials,
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions,
    });

    if (!credential) {
      throw new Error("Failed to create credential");
    }

    await verifyWebauthnRegistration(credential, setAlert);
  } catch (error: any) {
    console.error("Registration error:", error);

    if (error.name === "NotAllowedError") {
      setAlert({
        open: true,
        message:
          "Registration was cancelled or biometric authentication failed. Please try again.",
        severity: "error",
      });
    } else if (error.name === "InvalidStateError") {
      setAlert({
        open: true,
        message:
          "This device already has a passkey registered. Try removing existing credentials first.",
        severity: "error",
      });
    } else {
      setAlert({
        open: true,
        message: `Registration failed: ${error.message}`,
        severity: "error",
      });
    }
  }
}
