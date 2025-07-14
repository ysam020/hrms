import mongoose from "mongoose";
import ResignationModel from "../../model/resignationModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { cacheResponse } from "../../utils/cacheResponse.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";

const withdrawResignation = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const scope = req.permissionScope;
    const { _id } = req.params;

    const resignation = await ResignationModel.findById(_id).session(session);

    if (!resignation) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Resignation not found" });
    }

    if (scope !== "all" && resignation.username !== req.user.username) {
      await session.abortTransaction();
      return res
        .status(403)
        .json({ message: "Cannot withdraw someone else's resignation" });
    }

    resignation.status = "Withdrawn";
    const newResignation = await resignation.save({ session });

    const data = await ResignationModel.find({}).session(session);
    await cacheResponse("resignations", data);

    await logAuditTrail({
      userId: req.user._id,
      action: "WITHDRAW_RESIGNATION",
      entityType: "resignation",
      newData: newResignation,
      description: `${req.user.username} withdrew their resignation.`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();

    await notificationQueue.add(
      "addNotification",
      {
        title: "Resignation",
        message: `${req.user.username} withdrew their resignation.`,
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

    res.status(201).json({
      message: "Resignation withdrawn successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("withdrawResignation error:", err);
    next(err);
  } finally {
    session.endSession();
  }
};

export default withdrawResignation;
