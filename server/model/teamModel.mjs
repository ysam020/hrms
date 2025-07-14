import mongoose from "mongoose";

const Schema = mongoose.Schema;

const teamSchema = new Schema({
  team_name: { type: String, required: true },
  members: [{ type: String }],
});

const TeamModel = mongoose.model("Team", teamSchema);
export default TeamModel;
