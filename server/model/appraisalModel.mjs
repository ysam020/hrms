import mongoose from "mongoose";

const Schema = mongoose.Schema;

const appraisalEntry = new Schema({
  appraisalDate: { type: String },

  // Employee-filled fields
  score: { type: Number },
  strengths: { type: String },
  areasOfImprovement: { type: String },

  // Management-filled fields
  manager_strengths: { type: String },
  manager_AreasOfImprovement: { type: String },
  feedback: { type: String },
});

const AppraisalSchema = new mongoose.Schema({
  username: { type: String, required: true },
  appraisals: [appraisalEntry],
});

const AppraisalModel = mongoose.model("Appraisal", AppraisalSchema);
export default AppraisalModel;
