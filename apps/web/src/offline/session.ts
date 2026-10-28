import { diag } from "./diag";
import { getStore, type Scope } from "./store";

// Offline session mode. Praesto's access token lives only in memory and is
// restored with a refresh cookie, which needs the network — so without this,
// reopening the app offline would land on the sign-in page and the person
// couldn't keep working.
//
// After every successful sign-in a minimal profile is remembered on this
// device: who the person is (names, organisation, role, permissions — what
// the interface uses to lay itself out) and their scope. No token, cookie or
// other credential is stored. If the app later starts and cannot reach the
// server at all (a network failure, not a refusal), it opens in offline mode
// as that person. Nothing private is fetched in that mode — every API call
// needs the network — and the real session is checked as soon as the server
// is reachable; if it's refused, the person is signed out.
//
// The remembered profile is removed on sign-out and on any authentication
// failure, so it never outlives the session it came from.

const KEY = "session";

export interface RememberedSession {
  scope: Scope;
  user: Record<string, unknown>;
  savedAt: number;
}

const FIELDS = [
  "id",
  "_id",
  "username",
  "first_name",
  "last_name",
  "fullName",
  "imageURL",
  "designation",
  "tenantName",
  "tenantRole",
  "isSuperUser",
  "permissions",
  "wfhEnabled",
];

export async function rememberSession(user: any, scope: Scope | null) {
  if (!user || !scope) return;
  const kept: Record<string, unknown> = {};
  for (const f of FIELDS) if (user[f] !== undefined) kept[f] = user[f];
  try {
    await (
      await getStore()
    ).setMeta(KEY, { scope, user: kept, savedAt: Date.now() });
  } catch {
    // Not fatal: offline mode just won't be available.
  }
}

export async function recallSession(): Promise<RememberedSession | undefined> {
  try {
    return await (await getStore()).getMeta<RememberedSession>(KEY);
  } catch {
    return undefined;
  }
}

export async function forgetSession() {
  try {
    const store = await getStore();
    await store.deleteMeta(KEY);
    // Today's saved widget data (features/dashboard/data.ts CACHE_KEY).
    await store.deleteMeta("dashboard-cache");
    diag("session.forgotten");
  } catch {
    /* ignore */
  }
}
