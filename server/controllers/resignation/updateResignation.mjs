import mongoose from "mongoose";
import ResignationModel from "../../model/resignationModel.mjs";
import TeamModel from "../../model/teamModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { cacheResponse } from "../../utils/cacheResponse.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";

const updateResignationStatus = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const scope = req.permissionScope;
    const updaterUsername = req.user.username;
    const { _id } = req.params;
    const { status, value } = req.body;

    const resignation = await ResignationModel.findById(_id).session(session);
    if (!resignation) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Resignation not found" });
    }

    const username = resignation.username;

    // Scope-based validation
    if (scope === "self") {
      if (username !== updaterUsername) {
        await session.abortTransaction();
        return res.status(403).json({ message: "You do not have permission" });
      } else {
        await session.abortTransaction();
        return res.status(403).json({
          message: "You cannot update the status of your own resignation.",
        });
      }
    } else if (scope === "team") {
      const teams = await TeamModel.find({
        members: { $all: [updaterUsername, username] },
      }).session(session);

      if (!teams.length) {
        await session.abortTransaction();
        return res.status(403).json({
          message: "Access denied: the user is not in your team",
        });
      }
    }
    // scope === "all" → no restrictions

    const oldData = resignation.toObject();

    if (status === "Assets Returned") resignation.assetsReturned = value;
    else if (status === "FnF Done") resignation.fnfDone = value;
    else {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid status value" });
    }

    await resignation.save({ session });

    const data = await ResignationModel.find({}).session(session);
    await cacheResponse("resignations", data);

    await logAuditTrail({
      userId: req.user._id,
      action: "UPDATE_RESIGNATION_STATUS",
      entityType: "resignation",
      oldData,
      newData: resignation.toObject(),
      description: `${updaterUsername} updated resignation status for ${username} to "${status}" with value: ${value}.`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();

    await notificationQueue.add(
      "addNotification",
      {
        title: "Resignation",
        message: `${updaterUsername} updated resignation status for ${username} to "${status}" with value: ${value}.`,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );

    return res.status(200).json({ message: `${status} marked successfully` });
  } catch (err) {
    await session.abortTransaction();
    console.error("updateResignationStatus error:", err);
    next(err);
  } finally {
    session.endSession();
  }
};

export default updateResignationStatus;
