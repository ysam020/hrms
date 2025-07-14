import leaveBalanceModel from "../../model/leaveBalanceModel.mjs";

const getAvailablePaidLeaves = async (req, res) => {
  try {
    const username = req.user.username;

    const leaveBalance = await leaveBalanceModel.findOne({ username });

    if (!leaveBalance) {
      return res.status(404).json({ message: "Leave balance not found" });
    }

    // Sum remainingPL for all months
    const totalRemainingPL = leaveBalance.balances.reduce((sum, entry) => {
      return sum + entry.remainingPL;
    }, 0);

    const totalAvailablePL =
      leaveBalance.accumulatedPLBeforeCurrentMonth + totalRemainingPL;

    return res.status(200).json(totalAvailablePL);
  } catch (error) {
    console.error("Error in getAvailablePaidLeaves:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default getAvailablePaidLeaves;
