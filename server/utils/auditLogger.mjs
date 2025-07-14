import AuditModel from "../model/auditModel.mjs";

const logAuditTrail = async ({
  userId,
  action,
  entityType,
  oldData,
  newData,
  description,
  ipAddress,
  userAgent,
}) => {
  try {
    const auditLog = {
      user: userId,
      action,
      entityType,
      details: {
        ...(oldData && { oldValue: oldData }),
        ...(newData && { newValue: newData }),
      },
      description,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    };

    await AuditModel.create(auditLog);
  } catch (err) {
    console.error("Failed to log audit trail:", err);
  }
};

export default logAuditTrail;
