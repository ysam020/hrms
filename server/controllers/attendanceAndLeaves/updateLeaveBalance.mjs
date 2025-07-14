import moment from "moment";
import LeaveBalance from "../../model/leaveBalanceModel.mjs";
import UserModel from "../../model/userModel.mjs";
import dotenv from "dotenv";

dotenv.config();

// Helper function to get leave configuration based on company
const getLeaveConfig = (company) => {
  if (company === "Paymaster") {
    return {
      monthlyPaidLeaves: Number(process.env.PAYMASTER_MONTHLY_PAID_LEAVES),
      carryForwardLeaves: Number(process.env.PAYMASTER_CARRY_FORWARD_LEAVES),
    };
  } else {
    // For "Paymaster Management Solutions Limited" or any other company
    return {
      monthlyPaidLeaves: Number(process.env.PMSL_MONTHLY_PAID_LEAVES),
      carryForwardLeaves: Number(process.env.PMSL_CARRY_FORWARD_LEAVES),
    };
  }
};

export async function updateMonthlyLeaveAccrual() {
  const now = moment().startOf("day");
  const currentMonth = now.month() + 1; // make it 1-based
  const currentYear = now.year();
  const isApril = currentMonth === 4;

  try {
    const leaveBalances = await LeaveBalance.find();

    for (const userBalance of leaveBalances) {
      // Get user details to determine company
      const user = await UserModel.findOne({ username: userBalance.username });
      if (!user) {
        console.warn(`User not found for username: ${userBalance.username}`);
        continue;
      }

      const leaveConfig = getLeaveConfig(user.company);
      const { carryForwardLeaves } = leaveConfig;

      let totalRemainingPL = 0;

      // Calculate total remaining PL and reset used balances
      for (const bal of userBalance.balances) {
        if (
          bal.year < currentYear ||
          (bal.year === currentYear && bal.month < currentMonth)
        ) {
          totalRemainingPL += bal.remainingPL || 0;
          bal.remainingPL = 0; // reset after adding
        }
      }

      // Calculate new accumulated PL
      let newAccumulated =
        userBalance.accumulatedPLBeforeCurrentMonth + totalRemainingPL;

      // Apply April cap based on company configuration
      if (isApril && newAccumulated > carryForwardLeaves) {
        newAccumulated = carryForwardLeaves;
      }

      // Update the user's accumulated PL
      userBalance.accumulatedPLBeforeCurrentMonth = newAccumulated;
      await userBalance.save();
    }
  } catch (error) {
    console.error("Error in leave accrual update:", error);
  }
}
