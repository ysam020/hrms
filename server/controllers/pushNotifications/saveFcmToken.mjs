/**
 * @swagger
 * /api/save-fcm-token:
 *   put:
 *     summary: Save FCM token for push notifications
 *     description: This route saves the Firebase Cloud Messaging (FCM) token provided by the user to enable push notifications. The user must be authenticated via a valid session.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fcmToken:
 *                 type: string
 *                 description: The Firebase Cloud Messaging (FCM) token provided by the user to register for push notifications.
 *                 example: "fcm_token_string_here"
 *     responses:
 *       200:
 *         description: Successfully saved the FCM token and enabled push notifications.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Push notification enabled"
 *       404:
 *         description: User not found. The user with the provided session token doesn't exist in the database.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal server error. Failed to save the FCM token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while saving the FCM token. Please try again later"
 *     tags:
 *       - Push Notifications
 */

import UserModel from "../../model/userModel.mjs";

const saveFcmToken = async (req, res) => {
  try {
    const username = req.user.username;

    const { fcmToken } = req.body;
    // Find the user by username
    const user = await UserModel.findOne({ username });
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // Add the token to the array if it doesn't already exist
    if (!user.fcmTokens.includes(fcmToken)) {
      user.fcmTokens.push(fcmToken);
    }

    await user.save();

    res.status(200).send({ message: "Push notification enabled" });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message:
        "An error occurred while saving the FCM token. Please try again later",
    });
  }
};

export default saveFcmToken;
