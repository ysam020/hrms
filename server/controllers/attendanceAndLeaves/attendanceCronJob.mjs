import moment from "moment";
import AttendanceRecordsModel from "../../model/attendanceRecordsModel.mjs";
import LeaveModel from "../../model/LeaveApplicationsModel.mjs";
import LeaveBalanceModel from "../../model/leaveBalanceModel.mjs";
import UserModel from "../../model/userModel.mjs";
import HolidayModel from "../../model/holidayModel.mjs";

// Function to get leave configuration based on company
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

// Function to reconcile attendance for current month
async function reconcileMonthlyAttendance() {
  const today = moment();
  const yesterday = moment().subtract(1, "day");

  let targetMonth, targetYear, startDate, endDate;

  if (today.date() === 1) {
    // If today is 1st of month, process previous month completely
    const previousMonth = moment().subtract(1, "month");
    targetMonth = previousMonth.month() + 1;
    targetYear = previousMonth.year();
    startDate = previousMonth.startOf("month");
    endDate = previousMonth.endOf("month");
  } else {
    // Process current month up to yesterday
    targetMonth = today.month() + 1;
    targetYear = today.year();
    startDate = moment().startOf("month");
    endDate = yesterday;
  }

  // Validate date range
  if (startDate.isAfter(endDate)) {
    console.error(
      `Invalid date range: start date ${startDate.format(
        "YYYY-MM-DD"
      )} is after end date ${endDate.format("YYYY-MM-DD")}`
    );
    return;
  }

  // Get all active employees from database with company information
  const employees = await UserModel.find(
    { status: "Active" },
    "username company"
  ).lean();

  // Process each employee
  for (const employee of employees) {
    try {
      await processEmployeeAttendance(
        employee.username,
        employee.company,
        startDate,
        endDate,
        targetMonth,
        targetYear
      );
    } catch (error) {
      console.error(`Error processing ${employee.username}:`, error.message);
    }
  }
}

// Function to get holidays for a given date range
async function getHolidaysInRange(startDate, endDate) {
  try {
    const startYear = startDate.year();
    const endYear = endDate.year();
    const holidays = new Set();

    // Get holidays for all years in the range
    for (let year = startYear; year <= endYear; year++) {
      const yearHolidays = await HolidayModel.find({ year }).lean();

      yearHolidays.forEach((monthHoliday) => {
        monthHoliday.holidays.forEach((holiday) => {
          holidays.add(holiday.date);
        });
      });
    }

    return holidays;
  } catch (error) {
    console.error("Error fetching holidays:", error);
    return new Set();
  }
}

// Process individual employee attendance
async function processEmployeeAttendance(
  username,
  company,
  startDate,
  endDate,
  targetMonth,
  targetYear
) {
  try {
    // Get leave configuration for this employee's company
    const leaveConfig = getLeaveConfig(company);

    // Generate all working dates in the range
    const workingDates = generateWorkingDates(startDate, endDate);

    // Get existing attendance records for this employee in the date range
    const existingRecords = await AttendanceRecordsModel.find(
      {
        username,
        date: {
          $gte: startDate.format("YYYY-MM-DD"),
          $lte: endDate.format("YYYY-MM-DD"),
        },
      },
      "date"
    ).lean();

    const existingDates = new Set(existingRecords.map((record) => record.date));

    // Find missing dates
    const missingDates = workingDates.filter(
      (date) => !existingDates.has(date)
    );

    if (missingDates.length === 0) {
      return;
    }

    // Get holidays in the date range
    const holidays = await getHolidaysInRange(startDate, endDate);

    // Get or create leave balance record for this employee
    let leaveBalance = await LeaveBalanceModel.findOne({ username });
    if (!leaveBalance) {
      leaveBalance = await createInitialLeaveBalance(
        username,
        company,
        targetMonth,
        targetYear,
        leaveConfig
      );
    }

    // Ensure target month balance exists
    let targetMonthBalance = leaveBalance.balances.find(
      (b) => b.month === targetMonth && b.year === targetYear
    );

    if (!targetMonthBalance) {
      targetMonthBalance = {
        month: targetMonth,
        year: targetYear,
        earnedPL: leaveConfig.monthlyPaidLeaves,
        usedPL: 0,
        usedLWP: 0,
        remainingPL: leaveConfig.monthlyPaidLeaves,
      };
      leaveBalance.balances.push(targetMonthBalance);
    }

    // Process all missing dates at once
    await processBulkMissingDates(
      username,
      missingDates,
      leaveBalance,
      targetMonthBalance,
      holidays
    );

    // Save updated leave balance
    await leaveBalance.save();
  } catch (error) {
    console.error(`Error processing attendance for ${username}:`, error);
    throw error;
  }
}

// Process all missing dates in bulk for efficiency
async function processBulkMissingDates(
  username,
  missingDates,
  leaveBalance,
  targetMonthBalance,
  holidays
) {
  try {
    // Get user designation to check if HR
    const user = await UserModel.findOne({ username }, "designation").lean();
    const isHR = user?.designation?.toLowerCase().includes("hr") || false;

    // Categorize missing dates
    let holidayDates = [];
    let sundayWeekOffDates = [];
    let regularMissingDates = [];

    missingDates.forEach((date) => {
      if (holidays.has(date)) {
        // Holiday dates
        holidayDates.push(date);
      } else {
        const dayOfWeek = moment(date).day();
        if (isHR && dayOfWeek === 0) {
          // Sunday for HR users (Week Off)
          sundayWeekOffDates.push(date);
        } else {
          // Regular missing dates (require leave)
          regularMissingDates.push(date);
        }
      }
    });

    const totalLeaveDays = regularMissingDates.length; // Only count non-holiday, non-Sunday dates for leave calculation

    // Calculate leave distribution for regular missing dates (excluding holidays and Sunday Week Offs for HR)
    let remainingDaysToProcess = totalLeaveDays;
    let plDaysUsed = 0;
    let lwpDaysUsed = 0;

    if (totalLeaveDays > 0) {
      // First, use current month earned PL (don't let remainingPL go negative)
      const availableCurrentPL = Math.max(
        0,
        targetMonthBalance.earnedPL - targetMonthBalance.usedPL
      );
      const currentPLToUse = Math.min(
        remainingDaysToProcess,
        availableCurrentPL
      );

      if (currentPLToUse > 0) {
        plDaysUsed += currentPLToUse;
        remainingDaysToProcess -= currentPLToUse;
        targetMonthBalance.usedPL += currentPLToUse;
        targetMonthBalance.remainingPL = Math.max(
          0,
          targetMonthBalance.earnedPL - targetMonthBalance.usedPL
        );
      }

      // Then, use accumulated PL from previous months
      if (
        remainingDaysToProcess > 0 &&
        leaveBalance.accumulatedPLBeforeCurrentMonth > 0
      ) {
        const accumulatedPLToUse = Math.min(
          remainingDaysToProcess,
          leaveBalance.accumulatedPLBeforeCurrentMonth
        );
        plDaysUsed += accumulatedPLToUse;
        remainingDaysToProcess -= accumulatedPLToUse;

        //FIX: Decrement accumulated PL AND increment current month's usedPL
        leaveBalance.accumulatedPLBeforeCurrentMonth -= accumulatedPLToUse;
        targetMonthBalance.usedPL += accumulatedPLToUse; // This was missing!
      }

      // Finally, use LWP for remaining days
      if (remainingDaysToProcess > 0) {
        lwpDaysUsed = remainingDaysToProcess;
        targetMonthBalance.usedLWP += lwpDaysUsed;
      }
    }

    // Create attendance records for all missing dates
    const attendanceRecords = [];

    // Add holiday dates with Holiday status
    holidayDates.forEach((date) => {
      attendanceRecords.push({
        username,
        date,
        timeIn: null,
        timeOut: null,
        workingHours: 0,
        status: "Holiday",
        isCorrected: false,
        isSystemGenerated: true,
      });
    });

    // Add Sunday dates with Week Off status (only for HR users)
    if (isHR && sundayWeekOffDates.length > 0) {
      sundayWeekOffDates.forEach((date) => {
        attendanceRecords.push({
          username,
          date,
          timeIn: null,
          timeOut: null,
          workingHours: 0,
          status: "Week Off",
          isCorrected: false,
          isSystemGenerated: true,
        });
      });
    }

    // Add regular missing dates with Leave status
    regularMissingDates.forEach((date) => {
      attendanceRecords.push({
        username,
        date,
        timeIn: null,
        timeOut: null,
        workingHours: 0,
        status: "Leave",
        isCorrected: false,
        isSystemGenerated: true,
      });
    });

    if (attendanceRecords.length > 0) {
      await AttendanceRecordsModel.insertMany(attendanceRecords);
    }

    // Create leave application records (only for regular missing dates, not holidays or Sunday Week Off)
    const leaveApplications = [];

    // Create PL leave applications
    if (plDaysUsed > 0) {
      const plDates = regularMissingDates.slice(0, plDaysUsed);
      for (const date of plDates) {
        leaveApplications.push({
          username,
          from: date,
          to: date,
          leaveType: "PL",
          days: 1,
          status: "Approved",
          reason: "System generated - No attendance record found",
          appliedOn: new Date().toISOString(),
          approvedBy: {
            username: "SYSTEM",
            approvedOn: new Date().toISOString(),
          },
          isSystemGenerated: true,
        });
      }
    }

    // Create LWP leave applications
    if (lwpDaysUsed > 0) {
      const lwpDates = regularMissingDates.slice(plDaysUsed);
      for (const date of lwpDates) {
        leaveApplications.push({
          username,
          from: date,
          to: date,
          leaveType: "LWP",
          days: 1,
          status: "Approved",
          reason: "System generated - No attendance record found",
          appliedOn: new Date().toISOString(),
          approvedBy: {
            username: "SYSTEM",
            approvedOn: new Date().toISOString(),
          },
          isSystemGenerated: true,
        });
      }
    }

    if (leaveApplications.length > 0) {
      await LeaveModel.insertMany(leaveApplications);
    }
  } catch (error) {
    console.error(
      `Error processing bulk missing dates for ${username}:`,
      error
    );
    throw error;
  }
}

// Create initial leave balance for new employee
async function createInitialLeaveBalance(
  username,
  company,
  targetMonth,
  targetYear,
  leaveConfig
) {
  try {
    // Fetch the user's actual accumulated PL from the database
    const user = await UserModel.findOne({ username }, "accumulatedPL").lean();

    // Use actual accumulated PL if available, otherwise default to 0
    const actualAccumulatedPL = user?.accumulatedPL || 0;

    const leaveBalance = new LeaveBalanceModel({
      username,
      accumulatedPLBeforeCurrentMonth: actualAccumulatedPL,
      balances: [
        {
          month: targetMonth,
          year: targetYear,
          earnedPL: leaveConfig.monthlyPaidLeaves,
          usedPL: 0,
          usedLWP: 0,
          remainingPL: leaveConfig.monthlyPaidLeaves,
        },
      ],
    });

    await leaveBalance.save();
    return leaveBalance;
  } catch (error) {
    console.error(
      `Error creating initial leave balance for ${username}:`,
      error
    );
    throw error;
  }
}

// Generate working dates (includes all days - weekends and weekdays)
function generateWorkingDates(startDate, endDate) {
  const dates = [];
  const current = moment(startDate);

  while (current.isSameOrBefore(endDate)) {
    dates.push(current.format("YYYY-MM-DD"));
    current.add(1, "day");
  }

  return dates;
}

export default reconcileMonthlyAttendance;
