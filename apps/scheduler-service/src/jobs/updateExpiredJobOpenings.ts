import { prismaWithTenant } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { forEachActiveTenant } from "../utils/forEachTenant";

// "Apply by 31 Jul" keeps an opening open through all of 31 Jul. Deadlines
// are stored as that day's midnight (UTC or IST depending on how the form
// sent it), so an opening closes a full day after the stored instant — the
// rule the careers page (api-gateway utils/jobDeadline.ts isPastDeadline)
// and applyForJob already use. Expiring at the stored instant itself would
// close an IST-dated opening on the morning of its last day.
const DEADLINE_GRACE_MS = 24 * 60 * 60 * 1000;

/** Openings with a deadline at or before this instant are past it. */
export function jobOpeningExpiryCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - DEADLINE_GRACE_MS);
}

export async function updateExpiredJobOpenings(): Promise<void> {
  let expired = 0;
  try {
    // Job openings live in each tenant's own database.
    await forEachActiveTenant("updateExpiredJobOpenings", async (tenantId) => {
      const result = await prismaWithTenant.jobOpening.updateMany({
        where: {
          status: "Active",
          applicationDeadline: { lte: jobOpeningExpiryCutoff() },
        },
        data: {
          status: "Expired",
          lastUpdateBy: "System",
          lastUpdatedOn: new Date(),
        },
      });
      expired += result.count;
      if (result.count > 0) {
        await cacheManager.invalidatePattern(`t:${tenantId}:jobOpenings:*`);
      }
    });
  } catch (error) {
    logger.error("Error in Job Opening expiry job:", { error });
    throw error;
  } finally {
    logger.info(
      `updateExpiredJobOpenings: marked ${expired} job openings as Expired`,
    );
  }
}
