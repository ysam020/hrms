import mongoose from "mongoose";
import RoleModel from "../../model/roleModel.mjs";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const updateRolePermissions = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { _id } = req.params;
    const { permissions } = req.body;

    session.startTransaction();

    // Step 1: Find the role
    const role = await RoleModel.findById(_id).session(session);
    if (!role) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "Role not found" });
    }

    const oldRolePermissions = [...(role.permissions || [])];
    const roleName = role.name;
    const usernames = role.assignedTo.map((u) => u.username);

    // Step 2: Collect affected users
    const affectedUsers = await UserModel.find({
      username: { $in: usernames },
      role: roleName,
    }).session(session);

    const userPermissionsBefore = affectedUsers.map((user) => user.username);

    // Step 3: Update the role's permissions
    role.permissions = permissions;
    await role.save({ session });

    // Step 4: Update permissions of all users assigned to this role
    await UserModel.updateMany(
      { username: { $in: usernames }, role: roleName },
      { $set: { permissions: permissions } },
      { session }
    );

    // Step 5: Log audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "UPDATE_ROLE_PERMISSIONS",
      entityType: "employeeManagement",
      oldData: {
        role: roleName,
        permissions: oldRolePermissions,
        affectedUsers: userPermissionsBefore,
      },
      newData: {
        role: roleName,
        permissions,
      },
      description: `${req.user.username} updated permissions for the role ${roleName}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).send({
      message:
        "Role permissions updated and user permissions overwritten successfully",
    });
  } catch (error) {
    console.error("Error updating role permissions:", error);
    await session.abortTransaction();
    session.endSession();
    res.status(500).send({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export default updateRolePermissions;
