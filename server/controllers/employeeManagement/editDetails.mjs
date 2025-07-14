import mongoose from "mongoose";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const editDetails = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const { username, ...rest } = req.body;

    if (!username)
      return res.status(400).send({ message: "Username is required" });

    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "User not found" });
    }

    // Apply only fields that exist in req.body (excluding username)
    const auditLogData = {};

    for (const [key, value] of Object.entries(rest)) {
      // Only update if the field actually exists in the request body
      if (
        Object.prototype.hasOwnProperty.call(req.body, key) &&
        value !== undefined
      ) {
        user[key === "grossSalary" ? "salary" : key] = value;

        // Log non-salary related fields for audit
        if (!["salary", "salaryStructure", "grossSalary"].includes(key)) {
          auditLogData[key] = value;
        }
      }
    }

    // Ensure required fields have values
    if (!user.employeeStatus) user.employeeStatus = "Active";

    await user.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: "UPDATE_EMPLOYEE_DETAILS",
      entityType: "employeeManagement",
      newData: auditLogData,
      description: `${req.user.username} edited details of user ${username}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();
    res.status(200).send({ message: "User details updated successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default editDetails;
