import mongoose from "mongoose";
import HolidayModel from "../../model/holidayModel.mjs";
import moment from "moment";
import logAuditTrail from "../../utils/auditLogger.mjs";

const addHoliday = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { name, date } = req.body;

    if (!name || !date) {
      return res.status(400).json({ message: "Name and date are required." });
    }

    // Validate and parse the date in ISO format
    const momentDate = moment(date, moment.ISO_8601, true);
    if (!momentDate.isValid()) {
      return res.status(400).json({
        message: "Invalid date format. Use ISO 8601 format (YYYY-MM-DD).",
      });
    }

    const year = momentDate.year();
    const month = momentDate.month() + 1; // month() is 0-indexed

    // Start transaction
    await session.withTransaction(async () => {
      const existingDoc = await HolidayModel.findOne({ year, month }).session(
        session
      );

      if (existingDoc) {
        const alreadyExists = existingDoc.holidays.some(
          (holiday) => holiday.date === date
        );
        if (alreadyExists) {
          throw {
            status: 409,
            message: "Holiday already exists for this date.",
          };
        }

        existingDoc.holidays.push({ name, date });
        await existingDoc.save({ session });
      } else {
        const newHoliday = new HolidayModel({
          year,
          month,
          holidays: [{ name, date }],
        });
        await newHoliday.save({ session });
      }

      await logAuditTrail({
        userId: req.user._id,
        action: "ADD_HOLIDAY",
        entityType: "holiday",
        newData: { name, date },
        description: `${req.user.username} added a holiday: "${name}"`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
    });

    res.status(201).json({ message: "Holiday added successfully." });
  } catch (error) {
    if (error.status) {
      res.status(error.status).json({ message: error.message });
    } else {
      console.error("Error adding holiday:", error);
      res.status(500).json({ message: "Server error." });
    }
  } finally {
    session.endSession();
  }
};

export default addHoliday;
