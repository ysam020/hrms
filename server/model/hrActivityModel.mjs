import mongoose from "mongoose";

const Schema = mongoose.Schema;

const hrActivitySchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  time: {
    type: String,
    required: true,
  },
});

const hrActivityModel = mongoose.model("hrActivity", hrActivitySchema);
export default hrActivityModel;
