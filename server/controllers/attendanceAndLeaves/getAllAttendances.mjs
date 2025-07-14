import AttendanceRecordsModel from "../../model/attendanceRecordsModel.mjs";
import TeamModel from "../../model/teamModel.mjs";
import leaveBalanceModel from "../../model/leaveBalanceModel.mjs";

const getAllAttendances = async (req, res) => {
  try {
    const scope = req.permissionScope;
    const requesterUsername = req.user.username;
    const { year, month } = req.params;

    const queryYear = parseInt(year);
    const queryMonth = parseInt(month);

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const currentDay = currentDate.getDate();

    const lastDay = new Date(queryYear, queryMonth, 0).getDate();
    const daysToInclude =
      queryYear === currentYear && queryMonth === currentMonth
        ? currentDay
        : lastDay;

    // Create date range in YYYY-MM-DD format
    const dateRange = Array.from({ length: daysToInclude }, (_, i) => {
      const day = i + 1;
      return `${queryYear}-${queryMonth.toString().padStart(2, "0")}-${day
        .toString()
        .padStart(2, "0")}`;
    });

    // Get the date range for the query
    const startDate = `${queryYear}-${queryMonth
      .toString()
      .padStart(2, "0")}-01`;
    const endDate = dateRange[dateRange.length - 1];

    let attendanceQuery = {
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    // Apply scope-based filtering
    if (scope === "self") {
      // Only requester's own attendance
      attendanceQuery.username = requesterUsername;
    } else if (scope === "team") {
      // Find teams where the requester is a member
      const teams = await TeamModel.find({ members: requesterUsername });

      if (!teams.length) {
        return res
          .status(403)
          .json({ message: "Team not found or you are not in a team" });
      }

      // Extract unique members from all teams (including requester)
      const usernamesSet = new Set();
      for (const team of teams) {
        for (const member of team.members) {
          usernamesSet.add(member); // Include all members, including requester
        }
      }

      if (!usernamesSet.size) {
        return res
          .status(403)
          .json({ message: "No team members found in your teams" });
      }

      attendanceQuery.username = { $in: Array.from(usernamesSet) };
    }
    // If scope is "all", no username filter is applied - fetch all attendance records

    // Fetch all attendance records based on scope and date range
    const attendanceRecords = await AttendanceRecordsModel.find(
      attendanceQuery
    ).select("username date status");

    // Group records by username for efficient processing
    const recordsByUser = new Map();
    const allUsernames = new Set();

    for (const record of attendanceRecords) {
      allUsernames.add(record.username);
      if (!recordsByUser.has(record.username)) {
        recordsByUser.set(record.username, new Map());
      }
      recordsByUser.get(record.username).set(record.date, record.status);
    }

    // Fetch leave balance data for all users
    const leaveBalances = await leaveBalanceModel.find({
      username: { $in: Array.from(allUsernames) },
    });

    // Create a map for quick lookup of leave balances
    const leaveBalanceMap = new Map();
    for (const balance of leaveBalances) {
      const monthBalance = balance.balances.find(
        (b) => b.year === queryYear && b.month === queryMonth
      );
      if (monthBalance) {
        leaveBalanceMap.set(balance.username, {
          usedPL: monthBalance.usedPL,
          usedLWP: monthBalance.usedLWP,
        });
      }
    }

    const result = [];

    // Process each user that has attendance records
    for (const username of allUsernames) {
      let presents = 0;
      let halfDays = 0;

      const userRecords = recordsByUser.get(username) || new Map();

      // Check each date in the range
      for (const date of dateRange) {
        const status = userRecords.get(date) || "Leave";

        switch (status) {
          case "Present":
            presents++;
            break;
          case "Half Day":
            halfDays++;
            break;
          case "Leave":
          default:
            break;
        }
      }

      // Get leave balance data for this user
      const userLeaveBalance = leaveBalanceMap.get(username);

      result.push({
        username,
        presents,
        halfDays,
        paidLeaves: userLeaveBalance?.usedPL || 0,
        unpaidLeaves: userLeaveBalance?.usedLWP || 0,
        totalLeaves: userLeaveBalance?.usedPL + userLeaveBalance?.usedLWP,
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in getAllAttendances:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export default getAllAttendances;
