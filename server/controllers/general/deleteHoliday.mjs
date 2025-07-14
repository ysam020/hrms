import mongoose from "mongoose";
import HolidayModel from "../../model/holidayModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const deleteHoliday = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ message: "Date is required." });
    }

    await session.withTransaction(async () => {
      // Step 1: Find affected documents
      const docsWithHoliday = await HolidayModel.find({
        "holidays.date": date,
      }).session(session);

      if (docsWithHoliday.length === 0) {
        throw {
          status: 404,
          message: "No holiday found for the given date.",
        };
      }

      const deletedHolidays = [];

      for (const doc of docsWithHoliday) {
        const match = doc.holidays.find((h) => h.date === date);
        if (match) {
          deletedHolidays.push({ name: match.name, date: match.date });
        }
      }

      // Step 2: Perform deletion
      await HolidayModel.updateMany(
        { "holidays.date": date },
        { $pull: { holidays: { date } } },
        { session }
      );

      // Step 3: Audit log
      for (const holiday of deletedHolidays) {
        await logAuditTrail({
          userId: req.user._id,
          action: "DELETE_HOLIDAY",
          entityType: "holiday",
          oldData: holiday,
          description: `${req.user.username} deleted holiday "${holiday.name}"`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          session,
        });
      }
    });

    res.status(200).json({ message: "Holiday deleted successfully." });
  } catch (err) {
    if (err.status) {
      res.status(err.status).json({ message: err.message });
    } else {
      console.error("Error deleting holiday:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  } finally {
    session.endSession();
  }
};

export default deleteHoliday;
