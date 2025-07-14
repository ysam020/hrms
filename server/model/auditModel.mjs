import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  entityType: {
    type: String,
    required: true,
  },
  details: {
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  description: {
    type: String,
    default: "",
  },
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const AuditModel = mongoose.model("AuditLog", auditLogSchema);
export default AuditModel;
