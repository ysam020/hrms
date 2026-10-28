import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

type AlertFn = (alert: {
  open: boolean;
  message: string;
  severity: string;
}) => void;

export const disableWebAuthnCredential = async (
  credentialId: string,
  setAlert: AlertFn,
) => {
  try {
    const res = await apiClient.delete(API_ENDPOINTS.DISABLE_WEBAUTHN, {
      data: { credentialId },
    });

    setAlert({
      open: true,
      message: res.data.message,
      severity: "success",
    });
  } catch (error: any) {
    setAlert({
      open: true,
      message:
        error.response?.data?.message || "Error disabling WebAuthn credential",
      severity: "error",
    });
  }
};

export const disableAllWebAuthn = async (setAlert: AlertFn) => {
  try {
    const res = await apiClient.delete(API_ENDPOINTS.DISABLE_WEBAUTHN, {
      data: { disableAll: true },
    });

    setAlert({
      open: true,
      message: res.data.message,
      severity: "success",
    });
  } catch (error: any) {
    setAlert({
      open: true,
      message: error.response?.data?.message || "Error disabling WebAuthn",
      severity: "error",
    });
  }
};

export const getCurrentDeviceCredentialId = () => {
  return localStorage.getItem("currentWebAuthnCredentialId");
};

export const setCurrentDeviceCredentialId = (credentialId: string) => {
  localStorage.setItem("currentWebAuthnCredentialId", credentialId);
};
