import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

interface FcmTokenEntry {
  token: string;
  isActive?: boolean;
  createdAt?: string;
  lastUsed?: string;
}

let firebaseApp: any = null;

async function getFirebaseMessaging() {
  if (!firebaseApp) {
    const admin = await import("firebase-admin");
    if (!admin.default.apps.length) {
      firebaseApp = admin.default.initializeApp({
        credential: admin.default.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        } as any),
      });
    } else {
      firebaseApp = admin.default.apps[0];
    }
  }
  const admin = await import("firebase-admin");
  return admin.default.messaging();
}

export async function cleanupFcmTokens(): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { fcmTokens: { not: null } },
      select: { id: true, username: true, fcmTokens: true },
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    let totalRemoved = 0;
    let usersUpdated = 0;

    for (const user of users) {
      const tokens = (user.fcmTokens as unknown as FcmTokenEntry[]) ?? [];
      if (tokens.length === 0) continue;

      const messaging = await getFirebaseMessaging();
      const validTokens: FcmTokenEntry[] = [];
      let removed = 0;

      for (const tokenObj of tokens) {
        const token = typeof tokenObj === "string" ? tokenObj : tokenObj.token;
        if (!token) continue;

        const lastUsed = new Date(
          tokenObj.lastUsed ?? tokenObj.createdAt ?? Date.now(),
        );
        if (lastUsed < cutoffDate) {
          removed++;
          continue;
        }

        // Validate token via FCM dry-run
        try {
          await messaging.send(
            { token, notification: { title: "Test", body: "Test" } },
            true,
          );
          validTokens.push(tokenObj);
        } catch (err: any) {
          if (
            err?.code === "messaging/invalid-registration-token" ||
            err?.code === "messaging/registration-token-not-registered"
          ) {
            removed++;
          } else {
            validTokens.push(tokenObj); // keep on non-validity errors
          }
        }
      }

      if (removed > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { fcmTokens: validTokens as any },
        });
        totalRemoved += removed;
        usersUpdated++;
      }
    }

    logger.info(
      `cleanupFcmTokens: removed ${totalRemoved} stale tokens from ${usersUpdated} users`,
    );
  } catch (error) {
    logger.error("Error in FCM token cleanup job:", { error });
    throw error;
  }
}
