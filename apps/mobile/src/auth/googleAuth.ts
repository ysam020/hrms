import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { SERVER_URL } from "../config";

// Ensures Android closes any lingering browser tab and returns control to the
// app when the OAuth session completes (no-op on iOS/web).
WebBrowser.maybeCompleteAuthSession();

export interface GoogleOAuthResult {
  accessToken: string;
  refreshToken: string | null;
  needsTenantSetup: boolean;
}

export class GoogleOAuthCancelledError extends Error {}
export class GoogleOAuthFailedError extends Error {}

// Reuses the existing api-gateway authorization-code flow (same Google OAuth
// client as the web app, zero extra Google Cloud Console config) by opening
// it in an in-app browser and having the backend hand tokens back through a
// deep link instead of a browser redirect + httpOnly cookie. See
// apps/api-gateway/src/handlers/auth.ts googleAuthRedirect/googleAuthCallback
// for the `platform=mobile` branch this depends on.
export async function signInWithGoogle(): Promise<GoogleOAuthResult> {
  const redirectUrl = Linking.createURL("auth-callback");
  // In Expo Go / a dev client, redirectUrl is an exp://... URL, not our
  // hrms:// scheme — the backend needs the real one to redirect back to
  // (see MOBILE_REDIRECT_SCHEME_RE in apps/api-gateway/src/handlers/auth.ts).
  const authUrl = `${SERVER_URL}/api/v1/auth/google?platform=mobile&redirect_uri=${encodeURIComponent(redirectUrl)}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

  if (result.type !== "success") {
    throw new GoogleOAuthCancelledError("Sign-in was cancelled");
  }

  const { queryParams } = Linking.parse(result.url);
  const error = queryParams?.error;
  if (error) {
    throw new GoogleOAuthFailedError(String(error));
  }

  const accessToken = queryParams?.access_token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new GoogleOAuthFailedError("No access token returned");
  }

  const refreshToken =
    typeof queryParams?.refresh_token === "string"
      ? queryParams.refresh_token
      : null;

  return {
    accessToken,
    refreshToken,
    needsTenantSetup: queryParams?.tenant_setup === "1",
  };
}
