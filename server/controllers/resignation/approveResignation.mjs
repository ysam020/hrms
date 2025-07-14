import mongoose from "mongoose";
import ResignationModel from "../../model/resignationModel.mjs";
import UserModel from "../../model/userModel.mjs";
import TeamModel from "../../model/teamModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { cacheResponse } from "../../utils/cacheResponse.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const approveResignation = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const scope = req.permissionScope;
    const approverUsername = req.user.username;
    const { _id } = req.params;

    const resignation = await ResignationModel.findById(_id).session(session);
    if (!resignation) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Resignation not found" });
    }

    const username = resignation.username;

    // Scope-based validation
    if (scope === "team") {
      if (username === approverUsername) {
        await session.abortTransaction();
        return res.status(403).send({
          message: "You cannot approve your own resignation.",
        });
      }

      const teams = await TeamModel.find({
        members: { $all: [approverUsername, username] },
      }).session(session);

      if (!teams.length) {
        await session.abortTransaction();
        return res.status(403).send({
          message: "Access denied: the user is not in your team",
        });
      }
    }

    if (["Withdrawn", "Rejected"].includes(resignation.status)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Resignation has already been ${resignation.status.toLowerCase()}`,
      });
    }

    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    const notice_period = user.rank === 4 ? 30 : 60;
    const resignation_date = new Date(resignation.resignation_date);
    resignation_date.setDate(resignation_date.getDate() + notice_period);
    const last_date = resignation_date.toISOString().split("T")[0];

    resignation.status = "Approved";
    resignation.last_date = last_date;

    const newResignation = await resignation.save({ session });

    // Update cache
    const data = await ResignationModel.find({}).session(session);
    await cacheResponse("resignations", data);

    // Audit log
    await logAuditTrail({
      userId: req.user._id,
      action: "APPROVE_RESIGNATION",
      entityType: "resignation",
      newData: newResignation.toObject(),
      description: `${approverUsername} approved the resignation of ${username}.`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();

    await sendPushNotifications(
      username,
      "Resignation Approved",
      `Your resignation has been approved by ${approverUsername}.`
    );

    res.status(201).json({
      message: "Resignation approved successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("approveResignation error:", err);
    next(err);
  } finally {
    session.endSession();
  }
};

export default approveResignation;
