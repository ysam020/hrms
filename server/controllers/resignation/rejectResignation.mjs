import mongoose from "mongoose";
import ResignationModel from "../../model/resignationModel.mjs";
import TeamModel from "../../model/teamModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { cacheResponse } from "../../utils/cacheResponse.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const rejectResignation = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const scope = req.permissionScope;
    const rejectorUsername = req.user.username;
    const { _id } = req.params;

    const resignation = await ResignationModel.findById(_id).session(session);
    if (!resignation) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Resignation not found" });
    }

    const username = resignation.username;

    // Scope-based validation
    if (scope === "self") {
      if (username !== rejectorUsername) {
        await session.abortTransaction();
        return res.status(403).send({ message: "You do not have permission" });
      } else {
        await session.abortTransaction();
        return res.status(403).send({
          message: "You cannot approve or reject your own resignation.",
        });
      }
    } else if (scope === "team") {
      if (username === rejectorUsername) {
        await session.abortTransaction();
        return res.status(403).send({
          message: "You cannot reject your own resignation.",
        });
      }

      const teams = await TeamModel.find({
        members: { $all: [rejectorUsername, username] },
      }).session(session);

      if (!teams.length) {
        await session.abortTransaction();
        return res.status(403).send({
          message: "Access denied: the user is not in your team",
        });
      }
    }
    // scope === "all" → no restrictions

    resignation.status = "Rejected";
    resignation.last_date = "";
    const newResignation = await resignation.save({ session });

    // Update cache
    const data = await ResignationModel.find({}).session(session);
    await cacheResponse("resignations", data);

    // Log audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "REJECT_RESIGNATION",
      entityType: "resignation",
      newData: newResignation.toObject(),
      description: `${rejectorUsername} rejected the resignation of ${username}.`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();

    await sendPushNotifications(
      username,
      "Resignation Rejected",
      `Your resignation has been rejected by ${rejectorUsername}.`
    );

    res.status(201).json({
      message: "Resignation rejected successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("rejectResignation error:", err);
    next(err);
  } finally {
    session.endSession();
  }
};

export default rejectResignation;
