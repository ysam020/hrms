import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

/**
 * One-time migration: the old server stored recipients as an embedded array
 * inside each notification document:
 *   { recipients: [{ user: ObjectId, isCleared: bool }] }
 *
 * The new schema uses a separate notification_recipients collection.
 * This migration reads the embedded array (via raw MongoDB command) and
 * backfills notification_recipients rows. Safe to run multiple times.
 */
export async function migrateNotificationRecipients(): Promise<void> {
  try {
    // Read all notification documents that have an embedded recipients array
    const result = (await (prisma as any).$runCommandRaw({
      aggregate: "notifications",
      pipeline: [
        { $match: { "recipients.0": { $exists: true } } },
        { $project: { _id: 1, recipients: 1 } },
      ],
      cursor: {},
    })) as {
      cursor: {
        firstBatch: Array<{
          _id: { $oid: string } | string;
          recipients: Array<{
            user: { $oid: string } | string;
            isCleared?: boolean;
          }>;
        }>;
      };
    };

    const docs = result?.cursor?.firstBatch ?? [];
    if (docs.length === 0) return;

    let created = 0;
    let skipped = 0;

    for (const doc of docs) {
      const notificationId =
        typeof doc._id === "string" ? doc._id : doc._id.$oid;
      const embeddedRecipients = Array.isArray(doc.recipients)
        ? doc.recipients
        : [];

      for (const r of embeddedRecipients) {
        const userId = typeof r.user === "string" ? r.user : r.user?.$oid;
        if (!userId || !notificationId) {
          skipped++;
          continue;
        }

        const existing = await prisma.notificationRecipient.findFirst({
          where: { notificationId, userId },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }

        await (prisma.notificationRecipient.create as any)({
          data: { notificationId, userId, isCleared: r.isCleared ?? false },
        });
        created++;
      }
    }

    if (created > 0 || skipped > 0) {
      logger.info(
        `migrateNotificationRecipients: created ${created}, skipped ${skipped} (already existed)`,
      );
    }
  } catch (err) {
    logger.warn("migrateNotificationRecipients failed (non-fatal):", { err });
  }
}
