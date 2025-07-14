import AttendanceRecordsModel from "../../model/attendanceRecordsModel.mjs";

const getUserAttendances = async (req, res) => {
  try {
    const username = req.user.username;
    const { month, year } = req.params;

    // Validate month and year
    if (!month || !year || month < 1 || month > 12) {
      return res.status(400).send({ message: "Invalid month or year" });
    }

    const queriedMonth = parseInt(month, 10);
    const queriedYear = parseInt(year, 10);
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Determine the number of days in the queried month
    const daysInMonth = new Date(queriedYear, queriedMonth, 0).getDate();
    const endDay =
      queriedYear === currentYear && queriedMonth === currentMonth
        ? currentDate.getDate()
        : daysInMonth;

    // Generate date range for the month in YYYY-MM-DD format
    const dateRangeSet = new Set(
      Array.from({ length: endDay }, (_, i) => {
        const day = (i + 1).toString().padStart(2, "0");
        const monthStr = queriedMonth.toString().padStart(2, "0");
        return `${queriedYear}-${monthStr}-${day}`;
      })
    );

    // Create date range for MongoDB query
    const startDate = `${queriedYear}-${queriedMonth
      .toString()
      .padStart(2, "0")}-01`;
    const endDate = `${queriedYear}-${queriedMonth
      .toString()
      .padStart(2, "0")}-${daysInMonth.toString().padStart(2, "0")}`;

    // Fetch attendance records for the user within the date range
    const attendanceRecords = await AttendanceRecordsModel.find({
      username,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    }).select("date status timeIn timeOut workingHours isCorrected");

    if (!attendanceRecords || attendanceRecords.length === 0) {
      // If no records found, return all dates as "Leave"
      const report = Array.from(dateRangeSet).map((date) => ({
        date,
        status: "Leave",
        timeIn: "",
        timeOut: "",
        workingHours: 0,
        isCorrected: false,
      }));

      return res.status(200).json(report);
    }

    // Convert attendanceRecords into a HashMap for O(1) lookups
    const attendanceMap = new Map(
      attendanceRecords.map((record) => [record.date, record])
    );

    // Generate the attendance report
    const report = Array.from(dateRangeSet).map((date) => {
      const record = attendanceMap.get(date);

      return record
        ? {
            date,
            status: record.status || "Leave",
            timeIn: record.timeIn || "",
            timeOut: record.timeOut || "",
            workingHours: record.workingHours || 0,
            isCorrected: record.isCorrected || false,
          }
        : {
            date,
            status: "Leave",
            timeIn: "",
            timeOut: "",
            workingHours: 0,
            isCorrected: false,
          };
    });

    // Respond with the report
    res.status(200).json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export default getUserAttendances;
