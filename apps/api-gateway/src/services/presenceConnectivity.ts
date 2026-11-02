import { getWebSocketRedis } from "@hrms/websocket";
import { aggregateConnectivity, type Connectivity } from "./presenceRules";

// Ephemeral presence in Redis (docs/presence.md) — none of this is written
// to MongoDB. Every key is prefixed with the tenant id from the verified
// token, never with anything a client sent.
//
//   px:conn:<t>:<u>  hash   socket id → "active|<ms>" | "idle|<ms>"
//   px:last:<t>:<u>  string connectivity last announced (dedupes events)
//   px:dnd:<t>:<u>   string present while the person is on Do Not Disturb
//
// The connection hash expires on its own when heartbeats stop, so a gateway
// that dies without running its disconnect handlers can't leave anyone
// online; entries older than STALE_MS are ignored even before that.

export const HEARTBEAT_MS = 25_000;
// Browsers run a hidden tab's timers about once a minute, so allow for that.
export const STALE_MS = HEARTBEAT_MS * 4;
const CONN_TTL_MS = STALE_MS + 15_000;
const LAST_TTL_S = 7 * 24 * 3600;

/** Pub/sub channel every gateway worker listens on (config/presenceSocket.ts). */
export const PRESENCE_CHANNEL = "socket:presence";

export const roomFor = (tenantId: string, userId: string) =>
  `px:${tenantId}:${userId}`;
const connKey = (t: string, u: string) => `px:conn:${t}:${u}`;
const lastKey = (t: string, u: string) => `px:last:${t}:${u}`;
const dndKey = (t: string, u: string) => `px:dnd:${t}:${u}`;

const redis = () => getWebSocketRedis("client");

export type ConnectionState = "active" | "idle";

/** Add or refresh one connection (tab/device) of a person. */
export async function touchConnection(
  tenantId: string,
  userId: string,
  connectionId: string,
  state: ConnectionState,
  now = Date.now(),
): Promise<void> {
  await redis()
    .multi()
    .hset(connKey(tenantId, userId), connectionId, `${state}|${now}`)
    .pexpire(connKey(tenantId, userId), CONN_TTL_MS)
    .exec();
}

export async function dropConnection(
  tenantId: string,
  userId: string,
  connectionId: string,
): Promise<void> {
  await redis().hdel(connKey(tenantId, userId), connectionId);
}

/** Connectivity for many people in one round trip. */
export async function readConnectivity(
  tenantId: string,
  userIds: string[],
  now = Date.now(),
): Promise<Map<string, Connectivity>> {
  const out = new Map<string, Connectivity>();
  if (userIds.length === 0) return out;
  const pipe = redis().pipeline();
  for (const u of userIds) pipe.hvals(connKey(tenantId, u));
  const results = (await pipe.exec()) ?? [];
  userIds.forEach((u, i) => {
    const [err, vals] = results[i] ?? [];
    out.set(
      u,
      err
        ? "offline"
        : aggregateConnectivity((vals as string[]) ?? [], now, STALE_MS),
    );
  });
  return out;
}

/**
 * Record what was last announced for a person and say whether this is a
 * change. Shared across workers, so two tabs reconnecting at once (or a
 * refresh) don't announce "online" twice.
 */
export async function announceIfChanged(
  tenantId: string,
  userId: string,
  connectivity: Connectivity,
): Promise<boolean> {
  const before = await redis().set(
    lastKey(tenantId, userId),
    connectivity,
    "EX",
    LAST_TTL_S,
    "GET",
  );
  return before !== connectivity;
}

/** Keep the Do Not Disturb flag in step with the stored availability. */
export async function syncDoNotDisturb(
  tenantId: string,
  userId: string,
  dnd: boolean,
  until: Date | null,
): Promise<void> {
  if (!dnd) {
    await redis().del(dndKey(tenantId, userId));
    return;
  }
  if (until) {
    await redis().set(dndKey(tenantId, userId), "1", "PXAT", until.getTime());
  } else {
    await redis().set(dndKey(tenantId, userId), "1");
  }
}

/**
 * The people in `userIds` who aren't on Do Not Disturb. Fails open — if Redis
 * can't answer, everyone still gets the notification.
 */
export async function withoutDoNotDisturb(
  tenantId: string,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return userIds;
  try {
    const flags = await redis().mget(
      ...userIds.map((u) => dndKey(tenantId, u)),
    );
    return userIds.filter((_, i) => !flags[i]);
  } catch {
    return userIds;
  }
}

/** Fan a presence event out to every gateway worker's watchers of a person. */
export async function publishPresence(
  tenantId: string,
  userId: string,
  payload: unknown,
): Promise<void> {
  await getWebSocketRedis("publisher").publish(
    PRESENCE_CHANNEL,
    JSON.stringify({ room: roomFor(tenantId, userId), payload }),
  );
}
