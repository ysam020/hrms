import mongoose from "mongoose";

const Schema = mongoose.Schema;

const roleSchema = new Schema({
  name: { type: String },
  permissions: [{ type: String }],
  assignedTo: [
    {
      username: { type: String },
      fullName: { type: String },
      imgURL: { type: String },
    },
  ],
});

const RoleModel = mongoose.model("Roles", roleSchema);
export default RoleModel;
