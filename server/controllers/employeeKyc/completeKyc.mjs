import UserModel from "../../model/userModel.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";

const completeKyc = async (req, res) => {
  try {
    const { username } = req.body;

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
        message: `${username} filled up KYC form`,
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

    res.send({ message: "Successfully completed KYC" });
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred while updating the user data");
  }
};

export default completeKyc;
