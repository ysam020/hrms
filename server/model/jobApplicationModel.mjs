import mongoose from "mongoose";

const Schema = mongoose.Schema;

const interviewSchema = new Schema({
  roundNumber: {
    type: Number,
    required: true,
    default: 1,
    min: [0, "Round number cannot be less than 0"],
  },
  interviewDate: {
    type: String,
    required: true,
  },
  interviewStartTime: {
    type: String,
    required: true,
  },
  interviewEndTime: {
    type: String,
    required: true,
  },
  interviewer: {
    type: String,
  },
  interviewConducted: {
    type: Boolean,
    default: false,
  },
  feedback: {
    type: String,
    maxlength: [1000, "Feedback too long"],
  },
});

const jobApplicationSchema = new Schema({
  name: { type: String, uppercase: true },
  mobile: { type: String },
  email: { type: String, lowercase: true },
  aadharNo: { type: String },
  jobTitle: { type: mongoose.Schema.Types.ObjectId, ref: "JobOpening" },
  resume: { type: String },
  interviews: [interviewSchema],
  reason: { type: String },
  status: {
    type: String,
    enum: [
      "Applied",
      "Round 1 Scheduled",
      "Round 1 Rescheduled",
      "Round 1 Completed",
      "Round 1 Cleared",
      "Round 2 Scheduled",
      "Round 2 Rescheduled",
      "Round 2 Completed",
      "Round 2 Cleared",
      "Hired",
      "Rejected",
    ],
    default: "Scheduled",
  },
});

const JobApplicationModel = mongoose.model(
  "JobApplication",
  jobApplicationSchema
);
export default JobApplicationModel;
