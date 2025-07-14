import mongoose from "mongoose";

const ResignationSchema = new mongoose.Schema({
  username: { type: String },
  resignation_date: { type: String },
  last_date: { type: String },
  reason: { type: String },
  overall_job_satisfaction: { type: Number, default: 0 },
  quality_of_communication: { type: String },
  support_from_manager: { type: String },
  appreciation_for_work: { type: String },
  collaboration_within_the_team: { type: String },
  overall_company_culture: { type: String },
  suggestions: { type: String },
  assetsReturned: { type: Boolean },
  fnfDone: { type: Boolean },
  status: {
    type: String,
    enum: ["Submitted", "Withdrawn", "Approved", "Rejected"],
    default: "Submitted",
  },
});

const ResignationModel = new mongoose.model("Resignation", ResignationSchema);
export default ResignationModel;
