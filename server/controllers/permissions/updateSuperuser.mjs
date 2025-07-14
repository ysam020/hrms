import mongoose from "mongoose";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const updateSuperuser = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { username } = req.params;
    const { isSuperUser } = req.body;

    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "User not found" });
    }

    const oldIsSuperUser = user.isSuperUser;
    user.isSuperUser = isSuperUser;
    await user.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: "UPDATE_SUPERUSER",
      entityType: "employeeManagement",
      entityId: user._id,
      oldData: { isSuperUser: oldIsSuperUser },
      newData: { isSuperUser: user.isSuperUser },
      description: `${req.user.username} updated isSuperUser for ${username} from ${oldIsSuperUser} to ${isSuperUser}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).send({
      message: "Superuser status updated successfully.",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating superuser status:", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

export default updateSuperuser;
