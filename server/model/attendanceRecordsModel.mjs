import mongoose from "mongoose";
import moment from "moment";

// Helper to convert "h:mm A" (e.g., "3:37 PM") to minutes since midnight
const timeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const time = moment(timeStr, "h:mm A");
  if (!time.isValid()) return null;
  return time.hours() * 60 + time.minutes();
};

// Helper to calculate working hours from timeIn and timeOut
const calculateWorkingHours = (timeIn, timeOut) => {
  if (!timeIn || !timeOut) return 0;

  const inMinutes = timeToMinutes(timeIn);
  const outMinutes = timeToMinutes(timeOut);

  if (inMinutes === null || outMinutes === null || inMinutes > outMinutes) {
    return 0;
  }

  return (outMinutes - inMinutes) / 60; // Convert minutes to hours
};

// Helper to calculate status based on working hours
const calculateStatus = (workingHours) => {
  if (workingHours >= 7) return "Present";
  if (workingHours >= 5) return "Half Day";
  return "Leave";
};

const attendanceRecordsSchema = new mongoose.Schema({
  username: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  timeIn: {
    type: String,
    validate: {
      validator: function (value) {
        if (!value || !this.timeOut) return true;
        const inMinutes = timeToMinutes(value);
        const outMinutes = timeToMinutes(this.timeOut);
        if (inMinutes === null || outMinutes === null) return false;
        return inMinutes < outMinutes; // timeIn must be less than timeOut
      },
      message: "Time-in must be before time-out",
    },
  },
  timeOut: {
    type: String,
    validate: {
      validator: function (value) {
        if (!value || !this.timeIn) return true;
        const inMinutes = timeToMinutes(this.timeIn);
        const outMinutes = timeToMinutes(value);
        if (inMinutes === null || outMinutes === null) return false;
        return outMinutes > inMinutes; // timeOut must be greater than timeIn
      },
      message: "Time-out must be after time-in",
    },
  },
  workingHours: Number,
  status: {
    type: String,
    enum: ["Present", "Half Day", "Leave", "Holiday"],
  },
  isCorrected: { type: Boolean, default: false },
  correctedBy: String,
});

// Unique compound index
attendanceRecordsSchema.index({ username: 1, date: 1 }, { unique: true });

// Pre-save hook to auto-calculate workingHours and status
attendanceRecordsSchema.pre(
  ["save", "updateOne", "findOneAndUpdate"],
  async function (next) {
    const doc = this;
    const update = doc.getUpdate ? doc.getUpdate() : doc;

    // Extract values
    const timeIn = update?.$set?.timeIn || doc.timeIn;
    const timeOut = update?.$set?.timeOut || doc.timeOut;

    // Only validate if both times are present
    if (timeIn && timeOut) {
      const inMinutes = timeToMinutes(timeIn);
      const outMinutes = timeToMinutes(timeOut);

      if (inMinutes === null || outMinutes === null) {
        return next(new Error("Invalid time format"));
      }

      if (inMinutes >= outMinutes) {
        return next(new Error("Time-in must be before time-out"));
      }

      const workingHours = calculateWorkingHours(timeIn, timeOut);
      const status = calculateStatus(workingHours);

      if (update?.$set) {
        update.$set.workingHours = workingHours;
        update.$set.status = status;
      } else {
        doc.workingHours = workingHours;
        doc.status = status;
      }
    }

    // If only timeIn is present, mark as Leave
    else if (timeIn && !timeOut) {
      if (update?.$set) {
        update.$set.workingHours = 0;
        update.$set.status = "Leave";
      } else {
        doc.workingHours = 0;
        doc.status = "Leave";
      }
    }

    next();
  }
);

// Pre-update hook to handle findOneAndUpdate operations
attendanceRecordsSchema.pre(
  ["updateOne", "findOneAndUpdate", "save"],
  async function (next) {
    let update = {};
    let timeIn, timeOut;

    if (this.getUpdate) {
      // For updateOne or findOneAndUpdate
      update = this.getUpdate();

      // Normalize update to $set or direct fields
      if (update.$set) {
        timeIn = update.$set.timeIn;
        timeOut = update.$set.timeOut;
      } else {
        timeIn = update.timeIn;
        timeOut = update.timeOut;
      }
    } else {
      // For save
      timeIn = this.timeIn;
      timeOut = this.timeOut;
    }

    // If one value missing, try fetching existing doc values to compare properly
    if ((!timeIn || !timeOut) && this.getQuery) {
      const existingDoc = await this.model.findOne(this.getQuery());
      if (!timeIn) timeIn = existingDoc?.timeIn;
      if (!timeOut) timeOut = existingDoc?.timeOut;
    }

    // Validate times if both present
    if (timeIn && timeOut) {
      const inMinutes = timeToMinutes(timeIn);
      const outMinutes = timeToMinutes(timeOut);

      if (inMinutes === null || outMinutes === null) {
        return next(new Error("Invalid time format"));
      }

      if (inMinutes >= outMinutes) {
        return next(new Error("Time-in must be before time-out"));
      }

      // Calculate working hours and status
      const workingHours = calculateWorkingHours(timeIn, timeOut);
      const status = calculateStatus(workingHours);

      // Set values on update or doc
      if (update.$set) {
        update.$set.workingHours = workingHours;
        update.$set.status = status;
      } else if (update) {
        update.workingHours = workingHours;
        update.status = status;
      } else {
        this.workingHours = workingHours;
        this.status = status;
      }
    } else if (timeIn && !timeOut) {
      // If only timeIn, mark as Leave
      if (update.$set) {
        update.$set.workingHours = 0;
        update.$set.status = "Leave";
      } else {
        this.workingHours = 0;
        this.status = "Leave";
      }
    }

    next();
  }
);

const AttendanceRecordsModel = mongoose.model(
  "attendance_records",
  attendanceRecordsSchema
);

export default AttendanceRecordsModel;
