import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema({
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  holidays: [
    {
      name: { type: String, required: true },
      date: { type: String, required: true },
    },
  ],
});

const HolidayModel = mongoose.model("Holidays", holidaySchema);
export default HolidayModel;
