import mongoose from "mongoose";
import RoleModel from "../../model/roleModel.mjs";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const deleteRole = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { _id } = req.params;

    session.startTransaction();

    // Step 1: Find the role document within the session
    const roleToDelete = await RoleModel.findById(_id).session(session);
    if (!roleToDelete) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "Role not found" });
    }

    const roleName = roleToDelete.name;
    const usernames = roleToDelete.assignedTo.map((user) => user.username);

    // Step 2: Pull roleName from each user's `role` array within the session
    await UserModel.updateMany(
      { username: { $in: usernames } },
      { $pull: { role: roleName } },
      { session }
    );

    // Step 3: Delete the role document within the session
    await RoleModel.findByIdAndDelete(_id).session(session);

    // Step 4: Log audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "DELETE_ROLE",
      entityType: "employeeManagement",
      oldData: {
        role: {
          name: roleToDelete.name,
          permissions: roleToDelete.permissions,
        },
        users: usernames,
      },
      description: `${req.user.username} deleted the role ${roleToDelete.name}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).send({
      message: "Role deleted and removed from assigned users",
    });
  } catch (error) {
    console.error("Error deleting role:", error);
    await session.abortTransaction();
    session.endSession();
    res.status(500).send({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export default deleteRole;
