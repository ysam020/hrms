import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

interface BalanceEntry {
  month: number;
  year: number;
  earnedPL: number;
  usedPL: number;
  usedLWP: number;
  remainingPL: number;
}

const getLeaveConfig = () => ({
  carryForwardLeaves: Number(process.env.CARRY_FORWARD_LEAVES) || 15,
});

export async function updateLeaveBalance(): Promise<void> {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const isApril = currentMonth === 4;
    const { carryForwardLeaves } = getLeaveConfig();

    const leaveBalances = await prisma.leaveBalance.findMany();

    let updated = 0;
    for (const lb of leaveBalances) {
      const balances = (lb.balances as unknown as BalanceEntry[]) ?? [];
      let totalRemainingPL = 0;

      for (const bal of balances) {
        if (
          bal.year < currentYear ||
          (bal.year === currentYear && bal.month < currentMonth)
        ) {
          totalRemainingPL += bal.remainingPL ?? 0;
          bal.remainingPL = 0;
        }
      }

      let newAccumulated =
        lb.accumulatedPLBeforeCurrentMonth + totalRemainingPL;

      if (isApril && newAccumulated > carryForwardLeaves) {
        newAccumulated = carryForwardLeaves;
      }

      await prisma.leaveBalance.update({
        where: { id: lb.id },
        data: {
          accumulatedPLBeforeCurrentMonth: newAccumulated,
          balances: balances as any,
        },
      });

      updated++;
    }

    logger.info(`updateLeaveBalance: updated ${updated} leave balance records`);
  } catch (error) {
    logger.error("Error in leave balance update job:", { error });
    throw error;
  }
}
