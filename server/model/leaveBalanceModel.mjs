import mongoose from "mongoose";

const leaveBalanceSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },

    accumulatedPLBeforeCurrentMonth: { type: Number, default: 0 }, // accumulated PL from previous months

    balances: [
      {
        month: { type: Number, required: true }, // 1 to 12
        year: { type: Number, required: true },

        totalLeaves: {
          type: Number,
        },
        earnedPL: { type: Number },
        usedPL: { type: Number, default: 0 }, // Paid leaves used
        usedLWP: { type: Number, default: 0 }, // Leave without pay used
        remainingPL: {
          type: Number,
        },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("LeaveBalance", leaveBalanceSchema);
