import {
  absoluteAppLink,
  outboundSideEffectsAllowed,
  safeAppLink,
} from "@hrms/common";
import { prisma, BLOCKED_STATUSES } from "@hrms/db";
import { logger } from "@hrms/logger";
import { getMessaging } from "./admin";

interface FcmTokenEntry {
  token: string;
  deviceFingerprint: string;
  deviceInfo?: Record<string, string>;
  isActive?: boolean;
  lastUsed?: string | Date;
  createdAt?: string | Date;
}

// fcmTokens predates the deviceFingerprint-based multi-device format — some
// users still have plain-string entries from before that migration (see the
// "Legacy" chip in apps/web's PushNotifications.tsx). Every read of the
// array has to tolerate both shapes.
type StoredTokenEntry = FcmTokenEntry | string;

function getTokenValue(entry: StoredTokenEntry): string {
  return typeof entry === "string" ? entry : entry.token;
}

interface TokenRecord {
  token: string;
  userId: string;
  deviceInfo?: Record<string, string>;
}

interface SendOptions {
  /** Send only the single most-recently-used token per user (reduces duplicate notifications on multi-device users). */
  latestOnly?: boolean;
  /** App-relative route a tap opens ("/approvals"). Dropped unless safeAppLink() accepts it. */
  link?: string;
}

/**
 * The FCM message for one notification. `data.link` (relative) is what the
 * service worker's own click handler reads; `webpush.fcmOptions.link`
 * (absolute, https only per FCM) covers notifications the Firebase SDK
 * displays itself. Without a usable link the message is exactly what it was
 * before links existed.
 */
export function buildPushPayload(
  title: string,
  body: string,
  link?: string,
  clientUrl: string | undefined = process.env.CLIENT_URL,
): {
  notification: { title: string; body: string };
  data?: { link: string };
  webpush?: { fcmOptions: { link: string } };
} {
  const path = safeAppLink(link);
  if (!path) return { notification: { title, body } };
  const absolute = absoluteAppLink(path, clientUrl);
  return {
    notification: { title, body },
    data: { link: path },
    ...(absolute?.startsWith("https://")
      ? { webpush: { fcmOptions: { link: absolute } } }
      : {}),
  };
}

interface SendResult {
  success: boolean;
  message: string;
  sentCount: number;
  failedCount: number;
  totalTokens: number;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * Proof that a platform-wide push was deliberately requested. Only Praesto's
 * own organisation (PLATFORM_TENANT_ID) may send one, and the person who
 * authorized it is recorded.
 */
export interface PlatformBroadcastAuthorization {
  tenantId: string;
  authorizedBy: string;
  reason: string;
}

/**
 * Who a push goes to: a tenant's own users by userId, or — only with an
 * authorization — every user on the platform. There is no implicit
 * "everyone" target: an empty userIds list sends nothing.
 */
export type PushAudience =
  | { tenantId: string; userIds: string[] }
  | { platformBroadcast: PlatformBroadcastAuthorization };

export class PlatformBroadcastNotAuthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformBroadcastNotAuthorizedError";
  }
}

/** Throws unless `auth` comes from the configured platform tenant and names who authorized it. Fails closed when PLATFORM_TENANT_ID is unset. */
export function assertPlatformBroadcastAuthorized(
  auth: PlatformBroadcastAuthorization | null | undefined,
): void {
  const platform = process.env.PLATFORM_TENANT_ID?.trim();
  if (!platform || !OBJECT_ID.test(platform)) {
    throw new PlatformBroadcastNotAuthorizedError(
      "Platform broadcast refused: PLATFORM_TENANT_ID is not configured",
    );
  }
  if (!auth || auth.tenantId !== platform) {
    throw new PlatformBroadcastNotAuthorizedError(
      `Platform broadcast refused: tenant ${auth?.tenantId ?? "(none)"} is not the platform tenant`,
    );
  }
  if (!auth.authorizedBy?.trim() || !auth.reason?.trim()) {
    throw new PlatformBroadcastNotAuthorizedError(
      "Platform broadcast refused: authorizedBy and reason are required",
    );
  }
}

/** Pick active tokens from a user's fcmTokens JSON array. */
function pickTokens(
  fcmTokens: StoredTokenEntry[],
  latestOnly: boolean,
): StoredTokenEntry[] {
  const active = fcmTokens.filter(
    (t) => typeof t === "string" || t.isActive !== false,
  );
  if (!latestOnly || active.length <= 1) return active;

  // Find the single most-recently-used active token
  let best = active[0];
  const lastUsedOf = (t: StoredTokenEntry) =>
    typeof t === "string" || !t.lastUsed ? 0 : new Date(t.lastUsed).getTime();
  for (let i = 1; i < active.length; i++) {
    if (lastUsedOf(active[i]) > lastUsedOf(best)) best = active[i];
  }
  return best ? [best] : [];
}

/**
 * Send FCM push notifications.
 *
 * @param audience a tenant's users by userId, or an authorized platform broadcast
 * @param title    Notification title
 * @param body     Notification body
 * @param options  latestOnly — only send to the most-recently-used token per user
 */
export async function sendPushNotifications(
  audience: PushAudience,
  title: string,
  body: string,
  options: SendOptions = {},
): Promise<SendResult> {
  const { latestOnly = false, link } = options;

  const noTokens: SendResult = {
    success: false,
    message: "No active tokens found",
    sentCount: 0,
    failedCount: 0,
    totalTokens: 0,
  };

  if (!outboundSideEffectsAllowed()) {
    logger.info("Push notification suppressed in a non-production process");
    return noTokens;
  }

  let tokenRecords: TokenRecord[] = [];

  let where: Record<string, unknown>;
  if ("platformBroadcast" in audience) {
    // Throws (to the caller) rather than degrading to a smaller audience: a
    // refused broadcast is a bug the caller must see.
    assertPlatformBroadcastAuthorized(audience.platformBroadcast);
    logger.warn("[FCM] Platform-wide push broadcast", {
      authorizedBy: audience.platformBroadcast.authorizedBy,
      reason: audience.platformBroadcast.reason,
    });
    where = {
      fcmTokens: { not: null },
      // Never push to people whose employment ended.
      employeeStatus: { notIn: [...BLOCKED_STATUSES] },
    };
  } else {
    // The master users collection holds every tenant's users, so the tenant
    // filter is what keeps a push inside the organisation even if a caller
    // passes an id from elsewhere.
    const userIds = [...new Set(audience.userIds)].filter((id) =>
      OBJECT_ID.test(id),
    );
    if (!audience.tenantId || userIds.length === 0) return noTokens;
    where = {
      id: { in: userIds },
      tenantId: audience.tenantId,
      fcmTokens: { not: null },
      // Checked at SEND time (every attempt, retries included), so a
      // termination recorded while a notification was queued still applies.
      employeeStatus: { notIn: [...BLOCKED_STATUSES] },
    };
  }

  try {
    const users = await prisma.user.findMany({
      where,
      select: { id: true, fcmTokens: true },
    });

    tokenRecords = users.flatMap((u: any) => {
      const tokens = (u.fcmTokens as unknown as StoredTokenEntry[]) ?? [];
      return pickTokens(tokens, latestOnly).map((t) => ({
        token: getTokenValue(t),
        userId: u.id,
        deviceInfo: typeof t === "string" ? undefined : t.deviceInfo,
      }));
    });
  } catch (err) {
    logger.error("[FCM] Failed to fetch user tokens:", { err });
    return noTokens;
  }

  if (tokenRecords.length === 0) return noTokens;

  const messaging = getMessaging();
  const payload = buildPushPayload(title, body, link);

  let sentCount = 0;
  let failedCount = 0;

  // Track successful/invalid tokens per user, keyed by the token value
  // itself (unique per registration, and unlike deviceFingerprint it's
  // available on legacy string-format entries too) — applied as a single
  // batched read-modify-write per user after every send in this call has
  // settled, rather than one read-modify-write per token as each individual
  // send resolves. The latter let concurrent sends to the same multi-device
  // user race: two devices finishing around the same time would each read
  // the array before the other's write landed, so whichever write finished
  // last silently clobbered the first device's lastUsed update.
  const succeededByUser = new Map<string, Set<string>>();
  const failedByUser = new Map<string, Set<string>>();

  await Promise.allSettled(
    tokenRecords.map(async ({ token, userId, deviceInfo }) => {
      try {
        await messaging.send({ ...payload, token });
        sentCount++;
        if (!succeededByUser.has(userId))
          succeededByUser.set(userId, new Set());
        succeededByUser.get(userId)!.add(token);
      } catch (err: any) {
        failedCount++;
        logger.warn(
          `[FCM] Failed to send to ${deviceInfo?.browser ?? "unknown"} device:`,
          {
            code: err.code ?? err.message,
          },
        );

        // Track invalid/unregistered tokens for cleanup
        if (
          err.code === "messaging/invalid-registration-token" ||
          err.code === "messaging/registration-token-not-registered"
        ) {
          if (!failedByUser.has(userId)) failedByUser.set(userId, new Set());
          failedByUser.get(userId)!.add(token);
        }
      }
    }),
  );

  // One combined read-modify-write per affected user: bump lastUsed on
  // tokens that succeeded, drop tokens that came back invalid/unregistered.
  // A legacy string entry that succeeded is upgraded to object form here
  // (so it gets a lastUsed timestamp and becomes individually manageable
  // going forward) rather than being rewritten as a bare string.
  const affectedUserIds = new Set([
    ...succeededByUser.keys(),
    ...failedByUser.keys(),
  ]);
  if (affectedUserIds.size > 0) {
    const nowIso = new Date().toISOString();
    await Promise.allSettled(
      Array.from(affectedUserIds).map(async (userId) => {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { fcmTokens: true },
          });
          if (!user?.fcmTokens) return;

          const succeeded = succeededByUser.get(userId) ?? new Set();
          const failed = failedByUser.get(userId) ?? new Set();
          const updated = (user.fcmTokens as unknown as StoredTokenEntry[])
            .filter((entry) => !failed.has(getTokenValue(entry)))
            .map((entry) => {
              if (!succeeded.has(getTokenValue(entry))) return entry;
              return typeof entry === "string"
                ? { token: entry, lastUsed: nowIso }
                : { ...entry, lastUsed: nowIso };
            });

          // Conditional. This is a read-modify-write of fcmTokens;
          // if the person was terminated meanwhile (which clears their
          // tokens), an unconditional write would put the tokens back.
          await prisma.user.updateMany({
            where: {
              id: userId,
              employeeStatus: { notIn: [...BLOCKED_STATUSES] },
            },
            data: { fcmTokens: updated as any },
          });
        } catch (err) {
          logger.error(`[FCM] Token sync failed for user ${userId}:`, {
            err,
          });
        }
      }),
    );
  }

  return {
    success: sentCount > 0,
    message: `Sent to ${sentCount} devices, ${failedCount} failed`,
    sentCount,
    failedCount,
    totalTokens: tokenRecords.length,
  };
}
