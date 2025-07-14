import mongoose from "mongoose";
import RoleModel from "../../model/roleModel.mjs";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const saveUserPermissions = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { permissions, selectedUser, selectedRole } = req.body;

    session.startTransaction();

    const user = await UserModel.findOne({ username: selectedUser }).session(
      session
    );
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "User not found" });
    }

    const oldPermissions = [...(user.permissions || [])];

    // Merge and deduplicate permissions
    const mergedPermissions = Array.from(
      new Set([...(user.permissions || []), ...(permissions || [])])
    );

    const newlyAddedPermissions = mergedPermissions.filter(
      (perm) => !oldPermissions.includes(perm)
    );

    // Return early if no new permissions
    if (newlyAddedPermissions.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).send({
        message: "No new permissions to add",
      });
    }

    user.permissions = mergedPermissions;

    let descriptionRolePart = "via manual assignment";

    if (selectedRole) {
      if (!Array.isArray(user.role)) {
        user.role = user.role ? [user.role] : [];
      }

      if (!user.role.includes(selectedRole)) {
        user.role.push(selectedRole);
      }

      let roleDoc = await RoleModel.findOne({ name: selectedRole }).session(
        session
      );

      if (!roleDoc) {
        roleDoc = new RoleModel({
          name: selectedRole,
          assignedTo: [
            {
              username: selectedUser,
              fullName: user.getFullName(),
              imgURL: user.employee_photo,
            },
          ],
        });
        descriptionRolePart = "via manual assignment";
      } else {
        const isUserAlreadyAssigned = roleDoc.assignedTo.some(
          (assignedUser) => assignedUser.username === selectedUser
        );

        if (!isUserAlreadyAssigned) {
          roleDoc.assignedTo.push({
            username: selectedUser,
            fullName: user.getFullName(),
            imgURL: user.employee_photo,
          });
        }
        descriptionRolePart = `via Role: ${selectedRole}`;
      }

      await roleDoc.save({ session });
    }

    await user.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: "ADD_USER_PERMISSIONS",
      entityType: "employeeManagement",
      oldData: { username: selectedUser, permissions: oldPermissions },
      newData: { username: selectedUser, permissions: newlyAddedPermissions },
      description: `${req.user.username} updated permissions for ${selectedUser} ${descriptionRolePart}.`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).send({
      message: "User permissions and role updated successfully",
    });
  } catch (error) {
    console.error("Error updating user permissions and roles:", error);
    await session.abortTransaction();
    session.endSession();
    res.status(500).send({
      message: "Failed to update permissions and roles",
      error: error.message,
    });
  }
};

export default saveUserPermissions;
