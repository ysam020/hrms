import LeaveModel from "../../model/LeaveApplicationsModel.mjs";
import AttendanceRecordsModel from "../../model/attendanceRecordsModel.mjs";
import leaveBalanceModel from "../../model/leaveBalanceModel.mjs";
import TeamModel from "../../model/teamModel.mjs";
import moment from "moment";
import logAuditTrail from "../../utils/auditLogger.mjs";
import mongoose from "mongoose";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";
import UserModel from "../../model/userModel.mjs";
import dotenv from "dotenv";

dotenv.config();

// Helper function to get leave configuration based on company
const getLeaveConfig = (company) => {
  if (company === "Paymaster") {
    return {
      monthlyPaidLeaves: Number(process.env.PAYMASTER_MONTHLY_PAID_LEAVES),
      carryForwardLeaves: Number(process.env.PAYMASTER_CARRY_FORWARD_LEAVES),
    };
  } else {
    // For "Paymaster Management Solutions Limited" or any other company
    return {
      monthlyPaidLeaves: Number(process.env.PMSL_MONTHLY_PAID_LEAVES),
      carryForwardLeaves: Number(process.env.PMSL_CARRY_FORWARD_LEAVES),
    };
  }
};

const updateLeaveBalance = async (
  leaveRequest,
  leaveBalance,
  leaveConfig,
  session
) => {
  const { leaveType, from, to, username } = leaveRequest;
  const { monthlyPaidLeaves, carryForwardLeaves } = leaveConfig;
  const fromDate = moment(from, "YYYY-MM-DD");
  const toDate = moment(to, "YYYY-MM-DD");

  if (!leaveBalance) {
    leaveBalance = new leaveBalanceModel({ username });
  }

  // Helper function to check if a date is in a new financial year (April 1st onwards)
  const isNewFinancialYear = (currentDate, previousDate) => {
    const currentFY =
      currentDate.month() >= 3 ? currentDate.year() : currentDate.year() - 1;
    const previousFY =
      previousDate.month() >= 3 ? previousDate.year() : previousDate.year() - 1;
    return currentFY > previousFY;
  };

  if (leaveType === "LWP") {
    let currentDate = fromDate.clone();
    while (currentDate <= toDate) {
      const month = currentDate.month() + 1;
      const year = currentDate.year();

      let matchingBalance = leaveBalance.balances.find(
        (b) => b.month === month && b.year === year
      );

      if (!matchingBalance) {
        matchingBalance = {
          month,
          year,
          earnedPL: monthlyPaidLeaves,
          usedPL: 0,
          usedLWP: 0,
          remainingPL: monthlyPaidLeaves,
        };
        leaveBalance.balances.push(matchingBalance);
      }

      const monthEnd = currentDate.clone().endOf("month");
      const periodEnd = moment.min(toDate, monthEnd);

      // Correct inclusive day count
      const daysInThisMonth = periodEnd.diff(currentDate, "days") + 1;

      matchingBalance.usedLWP += daysInThisMonth;

      currentDate = monthEnd.clone().add(1, "day");
    }
  } else if (leaveType === "PL") {
    let totalAccumulatedUsed = 0;
    let currentDate = fromDate.clone();
    let previousDate = null;
    let hasFinancialYearChanged = false;

    while (currentDate <= toDate) {
      const month = currentDate.month() + 1;
      const year = currentDate.year();

      // Check if we've crossed into a new financial year
      if (previousDate && isNewFinancialYear(currentDate, previousDate)) {
        hasFinancialYearChanged = true;
        // Reset accumulated PL for new financial year
        leaveBalance.accumulatedPLBeforeCurrentMonth = carryForwardLeaves;
        // Reset totalAccumulatedUsed for the new financial year calculation
        totalAccumulatedUsed = 0;
      }

      let balanceIndex = leaveBalance.balances.findIndex(
        (b) => b.month === month && b.year === year
      );

      let matchingBalance;

      if (balanceIndex === -1) {
        matchingBalance = {
          month,
          year,
          earnedPL: monthlyPaidLeaves,
          usedPL: 0,
          usedLWP: 0,
          remainingPL: monthlyPaidLeaves,
        };
        leaveBalance.balances.push(matchingBalance);
        balanceIndex = leaveBalance.balances.length - 1;
      } else {
        matchingBalance = leaveBalance.balances[balanceIndex];
      }

      const monthEnd = currentDate.clone().endOf("month");
      const periodEnd = moment.min(toDate, monthEnd);

      // Fix inclusive day count here
      const daysInThisMonth =
        periodEnd.startOf("day").diff(currentDate.startOf("day"), "days") + 1;

      const monthlyAvailable =
        matchingBalance.earnedPL - matchingBalance.usedPL;

      // Use available PL days first
      const plUsedThisMonth = Math.min(daysInThisMonth, monthlyAvailable);

      matchingBalance.usedPL += plUsedThisMonth;

      // If needed, count extra days as accumulated PL used
      const extraDays = daysInThisMonth - plUsedThisMonth;

      if (extraDays > 0) {
        totalAccumulatedUsed += extraDays;
        matchingBalance.usedPL += extraDays; // reflect all days used
      }

      // Ensure remainingPL doesn't go negative
      matchingBalance.remainingPL = Math.max(
        matchingBalance.earnedPL - matchingBalance.usedPL,
        0
      );

      leaveBalance.balances[balanceIndex] = matchingBalance;
      leaveBalance.markModified("balances");

      // Store the current date as previous date for next iteration
      previousDate = currentDate.clone();
      currentDate = monthEnd.clone().add(1, "day");
    }

    // Check if we have sufficient accumulated PL balance
    if (totalAccumulatedUsed > leaveBalance.accumulatedPLBeforeCurrentMonth) {
      throw new Error(
        `Insufficient PL balance. Need ${
          totalAccumulatedUsed - leaveBalance.accumulatedPLBeforeCurrentMonth
        } more PL days.`
      );
    }

    // Deduct from accumulated PL balance
    leaveBalance.accumulatedPLBeforeCurrentMonth -= totalAccumulatedUsed;

    // If financial year hasn't changed during this leave period but we need to check
    // if we're starting in a new financial year, reset if needed
    if (!hasFinancialYearChanged && fromDate.month() >= 3) {
      const startOfCurrentFY = moment().month(3).date(1); // April 1st of current year
      if (fromDate.isSameOrAfter(startOfCurrentFY)) {
        // We might need additional logic here to determine if this is a new FY
        // This depends on your business logic for when FY resets are applied
      }
    }
  }

  await leaveBalance.save({ session });
  return leaveBalance;
};

const updateLeaveStatus = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { _id, status, username } = req.body;
    const userId = req.user?._id;

    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"];
    const scope = req.permissionScope;

    if (!_id || !status || !username) {
      return res.status(400).send({
        message: "Missing required fields",
      });
    }

    // Scope-based validation
    if (scope === "self") {
      if (username !== req.user?.username) {
        return res.status(403).send({
          message: "You cannot approve or reject your own leave request.",
        });
      }
    } else if (scope === "team") {
      if (username === req.user?.username) {
        return res.status(403).send({
          message: "You cannot approve or reject your own leave request.",
        });
      }

      const teams = await TeamModel.find({
        members: { $all: [req.user.username, username] },
      }).session(session);
      if (!teams.length) {
        return res.status(403).send({
          message: "Access denied: the user is not in your team",
        });
      }
    } else if (scope !== "self" && scope !== "team") {
      // For "all" or other scopes, you can add any additional validation if needed
      // Assuming no restrictions here
    }

    const statusMapping = {
      Approve: "Approved",
      Reject: "Rejected",
    };

    const dbStatus = statusMapping[status];
    if (!dbStatus) {
      return res.status(400).send({ message: "Invalid status value" });
    }

    await session.startTransaction();

    const leaveRequest = await LeaveModel.findById(_id).session(session);
    if (!leaveRequest) {
      await session.abortTransaction();
      return res.status(404).send({ message: "Leave request not found" });
    }

    // Get user details to determine company and leave configuration
    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).send({ message: "User not found" });
    }

    const leaveConfig = getLeaveConfig(user.company);

    // Prevent duplicate or invalid transitions
    if (dbStatus === leaveRequest.status) {
      await session.abortTransaction();
      return res
        .status(400)
        .send({ message: `Leave is already ${dbStatus.toLowerCase()}.` });
    }

    if (dbStatus === "Approved" && leaveRequest.status === "Rejected") {
      await session.abortTransaction();
      return res
        .status(400)
        .send({ message: "Cannot approve a leave that was already rejected." });
    }

    if (dbStatus === "Rejected" && leaveRequest.status === "Approved") {
      await session.abortTransaction();
      return res
        .status(400)
        .send({ message: "Cannot reject a leave that was already approved." });
    }

    if (dbStatus === "Approved") {
      // Update leave status
      leaveRequest.status = "Approved";
      leaveRequest.approvedBy = {
        username: req.user.username,
        approvedOn: new Date().toISOString(),
      };
      await leaveRequest.save({ session });

      // Create attendance records for all leave days (no weekend/holiday checks)
      const fromDate = moment(leaveRequest.from, "YYYY-MM-DD");
      const toDate = moment(leaveRequest.to, "YYYY-MM-DD");

      const attendanceRecords = [];
      let currentDate = fromDate.clone();

      while (currentDate <= toDate) {
        attendanceRecords.push({
          username: leaveRequest.username,
          date: currentDate.format("YYYY-MM-DD"),
          workingHours: 0,
          status: "Leave",
          isCorrected: false,
        });
        currentDate.add(1, "days");
      }

      let createdRecords = 0;
      for (const record of attendanceRecords) {
        try {
          const existingRecord = await AttendanceRecordsModel.findOne({
            username: record.username,
            date: record.date,
          }).session(session);

          if (!existingRecord) {
            await AttendanceRecordsModel.collection.insertOne(record, {
              session,
            });
            createdRecords++;
          }
        } catch (error) {
          if (error.code === 11000) continue;
          throw error;
        }
      }

      // Update leave balance only for team or all scope
      if (scope === "team" || (scope !== "self" && scope !== "team")) {
        let leaveBalance = await leaveBalanceModel
          .findOne({ username })
          .session(session);

        try {
          await updateLeaveBalance(
            leaveRequest,
            leaveBalance,
            leaveConfig,
            session
          );
        } catch (balanceError) {
          await session.abortTransaction();
          return res.status(400).json({ message: balanceError.message });
        }
      }

      await logAuditTrail({
        userId,
        action: "LEAVE_APPROVAL",
        entityType: "leave",
        newData: {
          leaveRequest: JSON.parse(JSON.stringify(leaveRequest)),
          attendanceRecordsCreated: createdRecords,
        },
        description: `${req.user.username} approved leave of ${username} from ${leaveRequest.from} to ${leaveRequest.to}`,
        ipAddress,
        userAgent,
      });
    } else if (dbStatus === "Rejected") {
      leaveRequest.status = "Rejected";
      leaveRequest.rejectedBy = {
        username: req.user.username,
        rejectedOn: new Date().toISOString(),
      };
      await leaveRequest.save({ session });

      await logAuditTrail({
        userId,
        action: "LEAVE_REJECTION",
        entityType: "leave",
        newData: {
          leaveRequest: JSON.parse(JSON.stringify(leaveRequest)),
        },
        description: `${req.user.username} rejected leave of ${username} from ${leaveRequest.from} to ${leaveRequest.to}`,
        ipAddress,
        userAgent,
      });
    }

    await session.commitTransaction();

    await sendPushNotifications(
      username,
      "Leave Status Update",
      `Your leave request from ${leaveRequest.from} to ${
        leaveRequest.to
      } has been ${dbStatus.toLowerCase()}.`
    );

    res.status(200).send({
      message: "Status updated successfully",
      leaveRequest,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Error updating leave status:", error);
    res.status(500).send({ message: error.message || "Internal Server Error" });
  } finally {
    session.endSession();
  }
};

export default updateLeaveStatus;
