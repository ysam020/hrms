import HolidayModel from "../../model/holidayModel.mjs";

const viewHolidays = async (req, res) => {
  try {
    const { year } = req.params;

    // Step 1: Get all records for the given year
    const records = await HolidayModel.find({ year: parseInt(year) });

    // Step 2: Flatten holidays
    const flatHolidays = records.flatMap((record) =>
      record.holidays.map((holiday) => ({
        name: holiday.name,
        date: holiday.date,
      }))
    );

    // Step 3: Send the flat response
    res.status(200).json(flatHolidays);
  } catch (error) {
    console.error("Error fetching holidays:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export default viewHolidays;
