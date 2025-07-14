import AttendanceRecordsModel from "../model/attendanceRecordsModel.mjs";
import LeaveBalanceModel from "../model/leaveBalanceModel.mjs";

const getAttendanceSummary = async (username, year, month) => {
  const today = new Date();
  const selectedMonth = parseInt(month);
  const selectedYear = parseInt(year);

  const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;

  let endDate;
  if (
    selectedYear === today.getFullYear() &&
    selectedMonth === today.getMonth() + 1
  ) {
    endDate = today.toISOString().split("T")[0]; // today's date
  } else {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay
      .toString()
      .padStart(2, "0")}`;
  }

  // Fetch attendance records for the user for the current month
  const attendanceRecords = await AttendanceRecordsModel.find({
    username,
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  }).select("date status");

  // Convert attendance records into a Map for fast lookup
  const attendanceMap = new Map(
    attendanceRecords.map((record) => [record.date, record.status])
  );

  // Initialize counters
  let presents = 0,
    leaves = 0,
    halfDays = 0,
    holidays = 0;

  // Iterate through the month's dates up to today
  const endDay = parseInt(endDate.split("-")[2]);

  for (let day = 1; day <= endDay; day++) {
    const dateStr = `${year}-${month.toString().padStart(2, "0")}-${day
      .toString()
      .padStart(2, "0")}`;
    const status = attendanceMap.get(dateStr);

    if (status === "Present") {
      presents++;
    } else if (status === "Half Day") {
      halfDays++;
    } else if (status === "Holiday") {
      holidays++;
    } else {
      // If no record exists or status is "Leave", count as leave
      leaves++;
    }
  }

  // Fetch current month's leave balance for the user
  const leaveBalanceDoc = await LeaveBalanceModel.findOne({
    username,
  }).lean();

  let usedPL = 0,
    usedLWP = 0;

  if (leaveBalanceDoc && Array.isArray(leaveBalanceDoc.balances)) {
    const currentMonthBalance = leaveBalanceDoc.balances.find(
      (b) => b.year === year && b.month === month
    );

    if (currentMonthBalance) {
      usedPL = currentMonthBalance.usedPL || 0;
      usedLWP = currentMonthBalance.usedLWP || 0;
    }
  }

  const result = {
    presents,
    halfDays,
    leaves,
    holidays,
    paidLeaves: usedPL,
    unpaidLeaves: usedLWP,
    totalLeaves: usedPL + usedLWP,
  };

  return result;
};

export default getAttendanceSummary;
