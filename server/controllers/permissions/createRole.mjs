import mongoose from "mongoose";
import RoleModel from "../../model/roleModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const createRole = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).send({ message: "Role name is required" });
    }

    session.startTransaction();

    const existingRole = await RoleModel.findOne({ name }).session(session);
    if (existingRole) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .send({ message: "Role with this name already exists" });
    }

    const newRole = new RoleModel({ name });
    await newRole.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: "CREATE_ROLE",
      entityType: "employeeManagement",
      newData: { name },
      description: `${req.user.username} created a role: ${newRole.name}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(201).send({ message: "Role created successfully" });
  } catch (error) {
    console.error(`Error creating role: ${error.message}`);
    await session.abortTransaction();
    session.endSession();
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default createRole;
