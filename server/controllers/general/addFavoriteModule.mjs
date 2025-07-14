import mongoose from "mongoose";
import UserModel from "../../model/userModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const addFavoriteModule = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, path } = req.body;

    // Validate path
    if (typeof path !== "string" || path.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).send({ message: "Invalid path" });
    }

    const user = await UserModel.findOne({
      username: req.user.username,
    }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "User not found" });
    }

    const modulePath = path.split("/").filter(Boolean).pop();
    if (!modulePath) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).send({ message: "Invalid module path" });
    }

    const existingIndex = user.favoriteModules.findIndex(
      (mod) => mod.path === modulePath
    );

    let actionType = "";
    let description = "";

    if (existingIndex !== -1) {
      user.favoriteModules.splice(existingIndex, 1);
      actionType = "REMOVE_FAVORITE_MODULE";
      description = `${req.user.username} removed '${name}' from favorite modules`;
    } else {
      if (user.favoriteModules.length >= 4) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send({
          message: "Cannot add more than 4 favorite modules",
        });
      }
      user.favoriteModules.push({ name, path: modulePath });
      actionType = "ADD_FAVORITE_MODULE";
      description = `${req.user.username} added '${name}' to favorite modules`;
    }

    await user.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: actionType,
      entityType: "user",
      newData: { name },
      description,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).send({ favoriteModules: user.favoriteModules });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default addFavoriteModule;
