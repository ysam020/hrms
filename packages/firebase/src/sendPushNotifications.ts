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

interface TokenRecord {
  token: string;
  userId: string;
  deviceFingerprint: string;
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
  fcmTokens: FcmTokenEntry[],
  latestOnly: boolean,
): FcmTokenEntry[] {
  const active = fcmTokens.filter((t) => t.isActive !== false);
  if (!latestOnly || active.length <= 1) return active;

  // Find the single most-recently-used active token
  let best = active[0];
  for (let i = 1; i < active.length; i++) {
    const curr = active[i].lastUsed
      ? new Date(active[i].lastUsed!).getTime()
      : 0;
    const bestT = best.lastUsed ? new Date(best.lastUsed!).getTime() : 0;
    if (curr > bestT) best = active[i];
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
    if (target === "ALL_USERS") {
      const users = await prisma.user.findMany({
        where: { fcmTokens: { not: null } },
        select: { id: true, fcmTokens: true },
      });

      tokenRecords = users.flatMap((u: any) => {
        const tokens = (u.fcmTokens as unknown as FcmTokenEntry[]) ?? [];
        return pickTokens(tokens, latestOnly).map((t) => ({
          token: t.token,
          userId: u.id,
          deviceFingerprint: t.deviceFingerprint,
          deviceInfo: t.deviceInfo,
        }));
      });
    } else {
      const usernames = Array.isArray(target) ? target : [target];

      const users = await prisma.user.findMany({
        where: {
          username: { in: usernames },
          fcmTokens: { not: null },
        },
        select: { id: true, username: true, fcmTokens: true },
      });

      tokenRecords = users.flatMap((u: any) => {
        const tokens = (u.fcmTokens as unknown as FcmTokenEntry[]) ?? [];
        return pickTokens(tokens, latestOnly).map((t) => ({
          token: t.token,
          userId: u.id,
          deviceFingerprint: t.deviceFingerprint,
          deviceInfo: t.deviceInfo,
        }));
      });
    }
  } catch (err) {
    logger.error("[FCM] Failed to fetch user tokens:", { err });
    return noTokens;
  }

  if (tokenRecords.length === 0) return noTokens;

  const messaging = getMessaging();
  const payload = { notification: { title, body } };

  let sentCount = 0;
  let failedCount = 0;

  // Track invalid tokens per user for batch cleanup
  const failedByUser = new Map<string, Set<string>>();

  await Promise.allSettled(
    tokenRecords.map(
      async ({ token, userId, deviceFingerprint, deviceInfo }) => {
        try {
          await messaging.send({ ...payload, token });
          sentCount++;

          // Update lastUsed on successful send
          if (deviceFingerprint) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { fcmTokens: true },
            });
            if (user?.fcmTokens) {
              const tokens = user.fcmTokens as unknown as FcmTokenEntry[];
              const idx = tokens.findIndex(
                (t) => t.deviceFingerprint === deviceFingerprint,
              );
              if (idx !== -1) {
                tokens[idx].lastUsed = new Date().toISOString();
                await prisma.user.update({
                  where: { id: userId },
                  data: { fcmTokens: tokens as any },
                });
              }
            }
          }
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
            userId &&
            deviceFingerprint &&
            (err.code === "messaging/invalid-registration-token" ||
              err.code === "messaging/registration-token-not-registered")
          ) {
            if (!failedByUser.has(userId)) failedByUser.set(userId, new Set());
            failedByUser.get(userId)!.add(deviceFingerprint);
          }
        }
      },
    ),
  );

  // Clean up invalid tokens in batch
  if (failedByUser.size > 0) {
    await Promise.allSettled(
      Array.from(failedByUser.entries()).map(
        async ([userId, badFingerprints]) => {
          try {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { fcmTokens: true },
            });
            if (!user?.fcmTokens) return;
            const cleaned = (
              user.fcmTokens as unknown as FcmTokenEntry[]
            ).filter((t) => !badFingerprints.has(t.deviceFingerprint));
            await prisma.user.update({
              where: { id: userId },
              data: { fcmTokens: cleaned as any },
            });
          } catch (err) {
            logger.error(`[FCM] Token cleanup failed for user ${userId}:`, {
              err,
            });
          }
        },
      ),
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
