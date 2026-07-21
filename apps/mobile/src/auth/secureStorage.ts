import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "hrms_refresh_token";
const BIOMETRIC_ENABLED_KEY = "hrms_biometric_enabled";
const LAST_EMAIL_KEY = "hrms_last_email";

export const getStoredRefreshToken = () =>
  SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

export const setStoredRefreshToken = (token: string) =>
  SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);

export const clearStoredRefreshToken = () =>
  SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);

export const isBiometricLoginEnabled = async () =>
  (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === "1";

export const setBiometricLoginEnabled = (enabled: boolean) =>
  enabled
    ? SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "1")
    : SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);

export const getStoredEmail = () => SecureStore.getItemAsync(LAST_EMAIL_KEY);

export const setStoredEmail = (email: string) =>
  SecureStore.setItemAsync(LAST_EMAIL_KEY, email);

export const clearSession = async () => {
  await Promise.all([
    clearStoredRefreshToken(),
    setBiometricLoginEnabled(false),
  ]);
};
