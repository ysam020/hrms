import mongoose from "mongoose";
import AttendanceRecordModel from "../../model/attendanceRecordsModel.mjs";
import LeaveModel from "../../model/LeaveApplicationsModel.mjs";
import LeaveBalanceModel from "../../model/leaveBalanceModel.mjs";
import haversine from "haversine-distance";
import dotenv from "dotenv";
import logAuditTrail from "../../utils/auditLogger.mjs";

dotenv.config();

const OFFICE_LOCATION = {
  latitude: parseFloat(process.env.LATITUDE),
  longitude: parseFloat(process.env.LONGITUDE),
};

// Utility function to get Indian Date and Time
const getIndianDateTime = () => {
  const date = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }); // 'YYYY-MM-DD'
  const time = new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }); // 'hh:mm AM/PM'
  return { date, time };
};

const recreditLeaveIfNeeded = async (session, username, date, status) => {
  if (!["Present", "Half Day"].includes(status)) return;

  const approvedLeave = await LeaveModel.findOne({
    username,
    status: "Approved",
    from: { $lte: date },
    to: { $gte: date },
  }).session(session);

  if (approvedLeave) {
    const [year, month] = date.split("-"); // from 'YYYY-MM-DD'
    const adjustment = status === "Present" ? 1 : 0.5;

    await LeaveBalanceModel.updateOne(
      {
        username,
        "balances.month": parseInt(month),
        "balances.year": parseInt(year),
      },
      {
        $inc: {
          "balances.$.remainingPL": adjustment,
          "balances.$.usedPL": -adjustment,
        },
      }
    ).session(session);
  }
};

const addAttendance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { field, latitude, longitude } = req.body;

    if (!["timeIn", "timeOut"].includes(field)) {
      throw new Error("Invalid field value. Must be 'timeIn' or 'timeOut'");
    }

    // Geofencing check
    if (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      !isNaN(latitude) &&
      !isNaN(longitude)
    ) {
      const userLocation = { latitude, longitude };
      const distance = haversine(OFFICE_LOCATION, userLocation);
      if (distance > 100) {
        throw new Error("Not in office");
      }
    }

    const username = req.user.username;
    const userId = req.user._id;

    const { date, time } = getIndianDateTime();

    let updatedRecord;

    const existingAttendance = await AttendanceRecordModel.findOne({
      username,
      date,
    }).session(session);

    if (existingAttendance) {
      if (field === "timeOut" && existingAttendance.timeOut) {
        throw new Error("Already punched out for today.");
      }

      const updateData = { [field]: time };

      await AttendanceRecordModel.updateOne(
        { username, date },
        { $set: updateData }
      ).session(session);

      updatedRecord = await AttendanceRecordModel.findOne({
        username,
        date,
      }).session(session);

      await recreditLeaveIfNeeded(
        session,
        username,
        date,
        updatedRecord.status
      );

      await logAuditTrail({
        userId,
        action:
          field === "timeIn" ? "ATTENDANCE_PUNCH_IN" : "ATTENDANCE_PUNCH_OUT",
        entityType: "attendance",
        newData: {
          [field]: time,
          date,
          status: updatedRecord.status,
          workingHours: updatedRecord.workingHours,
        },
        description: `${username} ${
          field === "timeIn" ? "punched in" : "punched out"
        } at ${time} on ${date}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      await session.commitTransaction();
      return res.status(200).json({
        message: `Updated successfully`,
        data: updatedRecord,
      });
    } else {
      if (field === "timeOut") {
        throw new Error("Cannot update timeOut without existing timeIn");
      }

      const newAttendance = {
        username,
        date,
        timeIn: time,
      };

      const [record] = await AttendanceRecordModel.create([newAttendance], {
        session,
      });

      await recreditLeaveIfNeeded(session, username, date, record.status);

      await logAuditTrail({
        userId,
        action: `ATTENDANCE_PUNCH_IN`,
        entityType: "attendance",
        newData: {
          ...newAttendance,
          status: record.status,
          workingHours: record.workingHours,
        },
        description: `${username} punched in attendance at ${time} on ${date}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      await session.commitTransaction();
      return res.status(201).json({
        message: `Added successfully`,
        data: record,
      });
    }
  } catch (error) {
    await session.abortTransaction();
    return res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

export default addAttendance;
