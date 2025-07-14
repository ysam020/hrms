import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema({
  username: { type: String, required: true },
  from: { type: String, required: true }, // YYYY-MM-DD
  to: { type: String, required: true }, // YYYY-MM-DD

  leaveType: { type: String, enum: ["PL", "LWP"], required: true }, // Paid Leave or Leave Without Pay
  days: { type: Number, required: true }, // total days of leave

  status: {
    type: String,
    enum: ["Approved", "Pending", "Rejected"],
    default: "Pending",
  },

  reason: String,
  sick_leave: Boolean,
  medical_certificate: String,

  appliedOn: { type: String, default: () => new Date().toISOString() },

  approvedBy: {
    username: String,
    approvedOn: String,
  },
});

leaveSchema.index({ username: 1, from: 1, to: 1 });

export default mongoose.model("Leave", leaveSchema);
