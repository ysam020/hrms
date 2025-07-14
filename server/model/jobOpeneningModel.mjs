import mongoose from "mongoose";

const Schema = mongoose.Schema;

const jobOpeningSchema = new Schema({
  jobTitle: {
    type: String,
    required: true,
    uppercase: true,
  },
  numberOfVacancies: {
    type: Number,
  },
  jobPostingDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  applicationDeadline: {
    type: Date,
    required: true,
    validate: {
      validator: function (value) {
        return value >= this.jobPostingDate;
      },
      message: "Application deadline must be after the job posting date",
    },
  },
  jobDescription: {
    type: String,
    required: true,
  },
  requiredSkills: {
    type: String,
    required: true,
  },
  experience: {
    type: Number,
    required: true,
    min: [0, "Experience must be a non-negative number"],
  },
  location: {
    type: String,
  },
  budget: {
    type: [Number],
    required: true,
    validate: {
      validator: function (value) {
        return value.length === 2 && value[0] >= 2 && value[1] <= 10;
      },
      message: "Budget range should have two values between 2 and 10",
    },
  },
  hiringManager: {
    type: String,
    required: true,
  },
  candidatesHired: {
    type: Number,
    default: 0,
  },
});

const JobOpeningModel = mongoose.model("JobOpening", jobOpeningSchema);
export default JobOpeningModel;
