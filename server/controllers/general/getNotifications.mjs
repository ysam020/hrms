import NotificationModel from "../../model/notificationModel.mjs";

const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all notifications and filter on the application level
    const notifications = await NotificationModel.find({
      recipients: {
        $elemMatch: {
          user: userId,
          isCleared: false,
        },
      },
    })
      .select("title message timeStamp")
      .sort({ timeStamp: -1 });

    res.status(200).json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export default getNotifications;
