import UserModel from "../../model/userModel.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";

const editKyc = async (req, res) => {
  try {
    const { username } = req.body;
    if (username === req.user.username && !req.user.isSuperUser) {
      return res.status(403).send("You cannot update your own KYC");
    }
    // Find the user by username
    const user = await UserModel.findOne({ username });

    if (!user) {
      return res.status(404).send("User not found");
    }

    // Update the user with the rest of the data from req.body
    Object.assign(user, req.body);
    user.kyc_approval = "Pending";
    const formattedDate = new Date().toISOString().split("T")[0];
    user.kyc_date = formattedDate;
    // Save the updated user document
    await user.save();

    await notificationQueue.add(
      "addNotification",
      {
        title: "Employee KYC",
        message: `${req.user.username} edited KYC of ${username}`,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );

    res.send({ message: "KYC updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "An error occurred while updating KYC" });
  }
};

export default editKyc;
