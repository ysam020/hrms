// Where to go after a Google sign-in. Passkey sign-in stays in the page and
// returns via router state (see LoginRoute), but Google's redirect leaves
// the app and comes back to "/", so the destination — e.g. an AI
// assistant's consent screen — is kept in sessionStorage for the round trip.

const KEY = "px-return-to";

/** Only same-app paths: never "//host" or anything with a scheme. */
const isAppPath = (p: unknown): p is string =>
  typeof p === "string" &&
  p.startsWith("/") &&
  !p.startsWith("//") &&
  !p.includes("\\") &&
  p !== "/";

export function rememberReturnPath(path: string | undefined | null) {
  try {
    if (isAppPath(path)) sessionStorage.setItem(KEY, path);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the sign-in still works, it just lands on Today.
  }
}

/** Reads and clears it, so it applies to one sign-in only. */
export function takeReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return isAppPath(path) ? path : null;
  } catch {
    return null;
  }
}
