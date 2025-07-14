import admin from "../config/firebaseAdmin.mjs";
import UserModel from "../model/userModel.mjs";

async function sendPushNotifications(target, title, body) {
  const payload = {
    notification: {
      title: title,
      body: body,
      image:
        "https://paymaster-document.s3.ap-south-1.amazonaws.com/kyc/personal.webp/favicon.png",
    },
  };

  let users = [];
  let allTokens = [];

  // Handle different input types
  if (target === "ALL_USERS") {
    // Fetch all users with FCM tokens
    users = await UserModel.find({
      fcmTokens: { $exists: true, $ne: [] },
    }).select("fcmTokens");
    allTokens = users.flatMap((user) =>
      user.fcmTokens.map((token) => ({
        token,
        userId: user._id,
      }))
    );
  } else if (Array.isArray(target)) {
    // Check if it's an array of usernames or tokens
    if (typeof target[0] === "string" && !target[0].includes(":")) {
      // Array of usernames
      users = await UserModel.find({
        username: { $in: target },
        fcmTokens: { $exists: true, $ne: [] },
      }).select("username fcmTokens");
      allTokens = users.flatMap((user) =>
        user.fcmTokens.map((token) => ({
          token,
          userId: user._id,
        }))
      );
    } else {
      // Array of FCM tokens (no DB lookup needed)
      allTokens = target.map((token) => ({ token, userId: null }));
    }
  } else if (typeof target === "string") {
    // Single username
    const user = await UserModel.findOne({
      username: target,
      fcmTokens: { $exists: true, $ne: [] },
    }).select("fcmTokens");

    if (user) {
      users = [user];
      allTokens = user.fcmTokens.map((token) => ({
        token,
        userId: user._id,
      }));
    }
  }

  if (allTokens.length === 0) {
    return;
  }

  // Track failed tokens by userId
  const failedTokensByUser = new Map();

  // Send notifications to all tokens
  await Promise.allSettled(
    allTokens.map(async ({ token, userId }) => {
      try {
        await admin.messaging().send({ ...payload, token });
      } catch (error) {
        // Only track failed tokens if we have userId (for DB cleanup)
        if (
          userId &&
          (error.code === "messaging/invalid-registration-token" ||
            error.code === "messaging/registration-token-not-registered")
        ) {
          if (!failedTokensByUser.has(userId.toString())) {
            failedTokensByUser.set(userId.toString(), new Set());
          }
          failedTokensByUser.get(userId.toString()).add(token);
        }
      }
    })
  );

  // Clean up failed tokens from database (only for users we fetched)
  if (failedTokensByUser.size > 0 && users.length > 0) {
    const updatePromises = users
      .filter((user) => failedTokensByUser.has(user._id.toString()))
      .map((user) => {
        const failedTokens = failedTokensByUser.get(user._id.toString());
        const validTokens = user.fcmTokens.filter(
          (token) => !failedTokens.has(token)
        );

        return UserModel.findByIdAndUpdate(
          user._id,
          { fcmTokens: validTokens },
          { new: true }
        );
      });

    await Promise.allSettled(updatePromises);
  }
}

export default sendPushNotifications;
