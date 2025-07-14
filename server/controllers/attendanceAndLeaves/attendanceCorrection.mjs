import mongoose from "mongoose";
import AttendanceRecordsModel from "../../model/attendanceRecordsModel.mjs";
import LeaveModel from "../../model/LeaveApplicationsModel.mjs";
import LeaveBalanceModel from "../../model/leaveBalanceModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";
import moment from "moment";

// Format and conversion helpers
const formatTo12Hour = (time) => {
  if (typeof time !== "string" || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [hoursStr, minutesStr] = time.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  )
    return null;
  const suffix = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 || 12;
  return `${String(formattedHours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )} ${suffix}`;
};

const convert12To24 = (time) => {
  const [timePart, modifier] = time.split(" ");
  let [hours, minutes] = timePart.split(":").map(Number);
  if (modifier === "PM" && hours !== 12) hours += 12;
  else if (modifier === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
};

const calculateWorkingHoursAndStatus = (timeInObj, timeOutObj) => {
  const timeInMinutes = timeInObj?.hours * 60 + timeInObj?.minutes;
  const timeOutMinutes = timeOutObj?.hours * 60 + timeOutObj?.minutes;
  const workingMinutes = timeOutMinutes - timeInMinutes;
  const workingHours = workingMinutes / 60;

  let status = "Leave";
  if (workingHours >= 7) status = "Present";
  else if (workingHours >= 5) status = "Half Day";
  return { workingHours, status };
};

const attendanceCorrection = async (req, res) => {
  const session = await mongoose.startSession();
  const date = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  try {
    const { username, timeIn, timeOut } = req.body;
    if (!timeIn && !timeOut) {
      return res
        .status(400)
        .json({ message: "Either time-in or time-out is required" });
    }

    const formattedTimeIn = timeIn ? formatTo12Hour(timeIn) : null;
    const formattedTimeOut = timeOut ? formatTo12Hour(timeOut) : null;

    await session.withTransaction(async () => {
      const attendance = await AttendanceRecordsModel.findOne({
        username,
        date,
      }).session(session);

      const createAuditLog = async (
        actionType,
        oldData,
        newData,
        description
      ) => {
        await logAuditTrail({
          userId: req.user._id,
          action: actionType,
          entityType: "attendance",
          oldData,
          newData,
          description,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      };

      if (!attendance) {
        const newRecord = {
          username,
          date,
          timeIn: formattedTimeIn,
          timeOut: formattedTimeOut || "",
          workingHours: 0,
          status: "Leave",
          isCorrected: true,
          correctedBy: req.user.username,
        };

        if (formattedTimeOut) {
          const timeInObj = convert12To24(formattedTimeIn);
          const timeOutObj = convert12To24(formattedTimeOut);
          const { workingHours, status } = calculateWorkingHoursAndStatus(
            timeInObj,
            timeOutObj
          );
          newRecord.workingHours = workingHours;
          newRecord.status = status;
        }

        const createdRecord = await AttendanceRecordsModel.create([newRecord], {
          session,
        });
        const record = createdRecord[0];

        // Leave re-credit logic for new record
        if (["Present", "Half Day"].includes(record.status)) {
          const approvedLeave = await LeaveModel.findOne({
            username,
            status: "Approved",
            from: { $lte: date },
            to: { $gte: date },
          }).session(session);

          if (approvedLeave) {
            const month = moment(date).month() + 1;
            const year = moment(date).year();
            const adjustment = record.status === "Present" ? 1 : 0.5;

            await LeaveBalanceModel.updateOne(
              {
                username,
                "balances.month": month,
                "balances.year": year,
              },
              {
                $inc: {
                  "balances.$.remainingPL": adjustment,
                },
              }
            ).session(session);
          }
        }

        await createAuditLog(
          "ATTENDANCE_CORRECTION",
          null,
          newRecord,
          `${req.user.username} created attendance for ${username}`
        );
        return res
          .status(201)
          .json({ message: "Attendance created successfully" });
      }

      const update = {};
      const oldData = {};

      if (formattedTimeIn) {
        oldData.timeIn = attendance.timeIn;
        update.timeIn = formattedTimeIn;
      }

      if (formattedTimeOut) {
        oldData.timeOut = attendance.timeOut;
        update.timeOut = formattedTimeOut;
      }

      const timeInForCalc = formattedTimeIn || attendance.timeIn;
      const timeOutForCalc = formattedTimeOut || attendance.timeOut;

      if (timeInForCalc && timeOutForCalc) {
        const timeInObj = convert12To24(timeInForCalc);
        const timeOutObj = convert12To24(timeOutForCalc);
        const { workingHours, status } = calculateWorkingHoursAndStatus(
          timeInObj,
          timeOutObj
        );
        update.workingHours = workingHours;
        update.status = status;
      }
      update.isCorrected = true;
      update.correctedBy = req.user.username;

      const updatedRecord = await AttendanceRecordsModel.findOneAndUpdate(
        { username, date },
        { $set: update },
        { session, new: true }
      );

      // ✅ Leave re-credit logic for updated record
      if (["Present", "Half Day"].includes(updatedRecord.status)) {
        const approvedLeave = await LeaveModel.findOne({
          username,
          status: "Approved",
          from: { $lte: date },
          to: { $gte: date },
        }).session(session);

        if (approvedLeave) {
          const month = moment(date).month() + 1;
          const year = moment(date).year();
          const adjustment = updatedRecord.status === "Present" ? 1 : 0.5;

          await LeaveBalanceModel.updateOne(
            {
              username,
              "balances.month": month,
              "balances.year": year,
            },
            {
              $inc: {
                "balances.$.remainingPL": adjustment,
              },
            }
          ).session(session);
        }
      }

      await createAuditLog(
        "ATTENDANCE_CORRECTION",
        oldData,
        update,
        `${req.user.username} corrected attendance for ${username}`
      );
      await sendPushNotifications(
        username,
        "Attendance Correction",
        `Your attendance for today has been corrected by ${req.user.username}.`
      );

      return res
        .status(200)
        .json({ message: "Attendance updated successfully" });
    });
  } catch (err) {
    console.error("Error correcting attendance:", err);
    return res.status(500).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

export default attendanceCorrection;
