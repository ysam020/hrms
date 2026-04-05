export { refreshToken } from "./refreshToken";
export { logout } from "./logout";
export { getProfile } from "./getProfile";
export { webAuthnRegistrationOptions } from "./webAuthnRegistrationOptions";
export { webAuthnRegistrationVerify } from "./webAuthnRegistrationVerify";
export { webAuthnAuthenticationOptions } from "./webAuthnAuthenticationOptions";
export { webAuthnAuthenticationVerify } from "./webAuthnAuthenticationVerify";
export { googleOAuthCallback } from "./googleOAuthCallback";

// Map to proto service method names
import { refreshToken } from "./refreshToken";
import { logout } from "./logout";
import { getProfile } from "./getProfile";
import { webAuthnRegistrationOptions } from "./webAuthnRegistrationOptions";
import { webAuthnRegistrationVerify } from "./webAuthnRegistrationVerify";
import { webAuthnAuthenticationOptions } from "./webAuthnAuthenticationOptions";
import { webAuthnAuthenticationVerify } from "./webAuthnAuthenticationVerify";
import { googleOAuthCallback } from "./googleOAuthCallback";

export const handlers = {
  RefreshToken: refreshToken,
  Logout: logout,
  GetProfile: getProfile,
  WebAuthnRegistrationOptions: webAuthnRegistrationOptions,
  WebAuthnRegistrationVerify: webAuthnRegistrationVerify,
  WebAuthnAuthenticationOptions: webAuthnAuthenticationOptions,
  WebAuthnAuthenticationVerify: webAuthnAuthenticationVerify,
  GoogleOAuthCallback: googleOAuthCallback,
};
