import UserModel from "../../model/userModel.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const kycApproval = async (req, res) => {
  try {
    const { username, kyc_approval } = req.body;

    if (!req.user.isSuperUser && req.user.username === username) {
      return res
        .status(400)
        .send({ message: "You cannot update your own KYC approval status" });
    }

    // Find the user by username
    const user = await UserModel.findOne({ username });

    if (!user) {
      return res.status(404).send("User not found");
    }

    // Update the kycApproval field
    user.kyc_approval = kyc_approval;

    // Save the updated user document
    await user.save();

    await sendPushNotifications(
      username,
      "KYC Status Update",
      `Your KYC status has been ${kyc_approval.toLowerCase()}`
    );

    res.send({ message: "KYC status updated successfully" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send("An error occurred while updating the KYC approval status");
  }
};

export default kycApproval;
