import mongoose from "mongoose";

const Schema = mongoose.Schema;

const notificationSchema = new Schema({
  title: { type: String },
  message: { type: String },
  timeStamp: { type: Date, default: Date.now },
  recipients: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      isCleared: {
        type: Boolean,
        default: false,
      },
    },
  ],
});

// Pre-save middleware to auto-populate recipients if not set
notificationSchema.pre("save", async function () {
  if (this.isNew && (!this.recipients || this.recipients.length === 0)) {
    const User = mongoose.model("User");
    const allUsers = await User.find({}, "_id");
    this.recipients = allUsers.map((user) => ({
      user: user._id,
      isCleared: false,
    }));
  }
});

export default mongoose.model("Notification", notificationSchema);
