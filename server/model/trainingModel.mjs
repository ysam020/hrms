import mongoose from "mongoose";

const Schema = mongoose.Schema;

const training = new Schema({
  trainingProgram: {
    type: String,
  },
  trainingDate: {
    type: String,
  },
  duration: {
    type: String,
  },
  trainingProvider: {
    type: String,
  },
  feedback: {
    type: String,
  },
});

const TrainingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  trainings: [training],
});

const TrainingModel = mongoose.model("Training", TrainingSchema);
export default TrainingModel;
