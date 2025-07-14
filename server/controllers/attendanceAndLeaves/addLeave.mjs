import LeaveModel from "../../model/LeaveApplicationsModel.mjs";
import convertDateFormat from "../../utils/convertDateFormat.mjs";
import moment from "moment";
import mongoose from "mongoose";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";
import UserModel from "../../model/userModel.mjs";

const addLeave = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const username = req.user.username;
    const { from, to, reason, sick_leave, medical_certificate, leaveType } =
      req.body;

    const user = await UserModel.findOne({ username }).select("rank");
    if (user.rank === 4 && leaveType === "PL") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "You cannot apply for paid leave" });
    }

    const fromDate = moment.utc(from, "YYYY-MM-DD", true).startOf("day");
    const toDate = moment.utc(to, "YYYY-MM-DD", true).endOf("day");

    if (!fromDate.isValid() || !toDate.isValid()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid date format." });
    }

    if (toDate.isBefore(fromDate)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "To date cannot be before from date." });
    }

    // Check for overlapping leaves
    const overlapping = await LeaveModel.findOne({
      username,
      $or: [
        {
          from: { $lte: to },
          to: { $gte: from },
        },
      ],
    }).session(session);

    if (overlapping) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message:
          "Leave already applied for this time range or overlapping dates.",
      });
    }

    const days = toDate.diff(fromDate, "days") + 1;

    const leaveRecord = await LeaveModel.create(
      [
        {
          username,
          from,
          to,
          days,
          leaveType,
          reason,
          sick_leave,
          medical_certificate,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    await notificationQueue.add(
      "addNotification",
      {
        title: "Leave",
        message: `${username} has applied for leave from ${convertDateFormat(
          from
        )} to ${convertDateFormat(to)}.`,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );

    await logAuditTrail({
      userId: req.user._id,
      action: "LEAVE_REQUEST",
      entityType: "leave",
      newData: {
        from,
        to,
        reason,
        leaveType,
        sick_leave,
        medical_certificate,
        appliedOn: leaveRecord[0].appliedOn,
      },
      description: `${username} applied for ${leaveType} leave from ${convertDateFormat(
        from
      )} to ${convertDateFormat(to)}.`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.status(200).json({ message: "Leave added successfully." });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export default addLeave;
