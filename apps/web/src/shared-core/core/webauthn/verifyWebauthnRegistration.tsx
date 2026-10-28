import apiClient from "@web/core/http/axiosConfig";
import { setCurrentDeviceCredentialId } from "./disableWebAuthn";
import { generateDeviceFingerprint } from "@web/shared/utils/pushNotifications/deviceFingerprint";
import { API_ENDPOINTS } from "@web/shared/constants";

type AlertFn = (alert: {
  open: boolean;
  message: string;
  severity: string;
}) => void;

export const verifyWebauthnRegistration = async (
  credential: any,
  setAlert: AlertFn,
) => {
  try {
    const { deviceInfo } = await generateDeviceFingerprint();

    const credentialForServer: any = {
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
      deviceInfo: deviceInfo,
    };

    if (credentialForServer.rawId instanceof ArrayBuffer) {
      credentialForServer.rawId = Array.from(
        new Uint8Array(credentialForServer.rawId),
      );
    }

    if (credentialForServer.response.clientDataJSON instanceof ArrayBuffer) {
      credentialForServer.response.clientDataJSON = Array.from(
        new Uint8Array(credentialForServer.response.clientDataJSON),
      );
    }

    if (credentialForServer.response.attestationObject instanceof ArrayBuffer) {
      credentialForServer.response.attestationObject = Array.from(
        new Uint8Array(credentialForServer.response.attestationObject),
      );
    }

    const res = await apiClient.post(
      API_ENDPOINTS.WEBAUTHN_VERIFY_REGISTRATION,
      {
        credential: credentialForServer,
      },
    );

    if (res.data.success) {
      setCurrentDeviceCredentialId(credential.id);

      setAlert({
        open: true,
        message: "WebAuthn registration successful!",
        severity: "success",
      });
    } else {
      setAlert({
        open: true,
        message:
          res.data.message || "WebAuthn registration failed. Please try again.",
        severity: "error",
      });
    }
  } catch (error: any) {
    console.error("Registration verification error:", error);
    setAlert({
      open: true,
      message: error.response?.data?.message || error.message,
      severity: "error",
    });
  }
};
