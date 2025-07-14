import mongoose from "mongoose";
import RoleModel from "../../model/roleModel.mjs";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const deleteUserRole = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { username, roleId } = req.body;

    session.startTransaction();

    // Find the role inside the transaction session
    const role = await RoleModel.findById(roleId).session(session);
    if (!role) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "Role not found" });
    }

    // Remove the user from the role's assignedTo array (within session)
    const updatedRole = await RoleModel.findByIdAndUpdate(
      roleId,
      { $pull: { assignedTo: { username } } },
      { new: true, session }
    );

    // Remove the role's permissions from the user's permissions array (within session)
    const updatedUser = await UserModel.findOneAndUpdate(
      { username },
      { $pull: { permissions: { $in: role.permissions } } },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "User not found" });
    }

    // Audit log
    await logAuditTrail({
      userId: req.user._id,
      action: "DELETE_USER_ROLE",
      entityType: "employeeManagement",
      newData: {
        name: role.name,
        permissions: updatedRole.permissions,
        user: username,
      },
      description: `${req.user.username} removed ${username} from role ${role.name}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).send({
      message: `Successfully removed ${username} from role ${role.name}`,
      updatedRole,
      updatedUser,
    });
  } catch (error) {
    console.error("Error deleting user role:", error);
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .send({ message: "Internal Server Error", error: error.message });
  }
};

export default deleteUserRole;
