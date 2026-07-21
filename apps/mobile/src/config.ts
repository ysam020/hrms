import { Platform } from "react-native";
import Constants from "expo-constants";

// Mirrors apps/web's VITE_SERVER_URL / VITE_API_STRING split: SERVER_URL is the
// api-gateway origin (unversioned routes live there too, e.g. /api/auth/google
// /callback), API_URL is the versioned base every other request uses.
//
// Always prefer the dev machine's real LAN IP over "localhost" in dev.
// Docker Desktop's localhost port-forwarding (its userspace vpnkit/
// Virtualization.framework proxy) doesn't reliably reach the iOS Simulator's
// network namespace even though it works fine from Safari/curl on the Mac
// itself — the LAN IP goes through a real interface and works everywhere
// (Simulator, physical device, Android emulator). Metro already knows this
// host (it's how the device loaded the JS bundle in the first place).
const devHost = Constants.expoConfig?.hostUri?.split(":")[0];

const DEFAULT_SERVER_URL =
  Platform.OS === "android" && (!devHost || devHost === "localhost")
    ? "https://10.0.2.2:9002"
    : __DEV__ && devHost
      ? `https://${devHost}:9002`
      : "https://localhost:9002";

// Override explicitly if needed, e.g. a tunnel/ngrok URL:
//   EXPO_PUBLIC_SERVER_URL=https://192.168.1.23:9002 npx expo start
export const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL || DEFAULT_SERVER_URL;

export const API_URL = `${SERVER_URL}/api/v1`;

export const APP_SCHEME = "hrms";
export const AUTH_CALLBACK_PATH = "auth-callback";
