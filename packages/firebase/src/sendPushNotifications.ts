import { prisma } from "@hrms/db";
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
}

interface SendResult {
  success: boolean;
  message: string;
  sentCount: number;
  failedCount: number;
  totalTokens: number;
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
 * @param target  "ALL_USERS" | single username string | array of usernames
 * @param title   Notification title
 * @param body    Notification body
 * @param options latestOnly — only send to the most-recently-used token per user
 */
export async function sendPushNotifications(
  target: "ALL_USERS" | string | string[],
  title: string,
  body: string,
  options: SendOptions = {},
): Promise<SendResult> {
  const { latestOnly = false } = options;

  const noTokens: SendResult = {
    success: false,
    message: "No active tokens found",
    sentCount: 0,
    failedCount: 0,
    totalTokens: 0,
  };

  let tokenRecords: TokenRecord[] = [];

  try {
    const where =
      target === "ALL_USERS"
        ? { fcmTokens: { not: null } }
        : {
            username: {
              in: Array.isArray(target) ? target : [target],
            },
            fcmTokens: { not: null },
          };
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
  const payload = { notification: { title, body } };

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

          await prisma.user.update({
            where: { id: userId },
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
