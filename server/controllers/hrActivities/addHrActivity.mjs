/**
 * @swagger
 * /api/add-hr-activity:
 *   post:
 *     summary: Add an HR activity
 *     description: This route allows adding an HR activity. A valid session token must be included in the request for authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "HR Meeting"
 *               description:
 *                 type: string
 *                 example: "Meeting with HR team"
 *               date:
 *                 type: string
 *                 example: "2023-08-15"
 *               time:
 *                 type: string
 *                 example: "10:00 AM"
 *     responses:
 *       201:
 *         description: HR activity added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "HR activity added successfully"
 *       401:
 *         description: Unauthorized, No token provided or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized: No token provided"
 *       500:
 *         description: Internal server error if something goes wrong.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Something went wrong"
 *     tags:
 *       - HR Activities
 */

// import mongoose from "mongoose";
// import hrActivityModel from "../../model/hrActivityModel.mjs";
// import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";
// import logAuditTrail from "../../utils/auditLogger.mjs";
// import { notificationQueue } from "../../config/queueConfig.mjs";
// import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

// const addHrActivity = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const hrActivity = req.body;

//     // Step 1: Save new HR activity inside transaction
//     const newHrActivity = new hrActivityModel(hrActivity);
//     await newHrActivity.save({ session });

//     // Step 2: Log audit trail
//     await logAuditTrail({
//       userId: req.user._id,
//       action: "ADD_HR_ACTIVITY",
//       entityType: "hrActivity",
//       newData: newHrActivity,
//       description: `${req.user.username} added an HR activity`,
//       ipAddress: req.ip,
//       userAgent: req.headers["user-agent"],
//     });

//     // Commit transaction (save + audit)
//     await session.commitTransaction();
//     session.endSession();

//     // Step 3: Update cache outside transaction
//     const cacheKey = `hrActivities`;
//     const cachedActivities = (await getCachedData(cacheKey)) || [];
//     cachedActivities.push(newHrActivity);
//     await cacheResponse(cacheKey, cachedActivities);

//     await notificationQueue.add(
//       "addNotification",
//       {
//         title: "HR Activity",
//         message: `${req.user.username} has added a new HR Activity`,
//       },
//       {
//         attempts: 3,
//         backoff: {
//           type: "exponential",
//           delay: 2000,
//         },
//         removeOnComplete: 10,
//         removeOnFail: 5,
//       }
//     );

//     res.status(201).send({ message: "HR activity added successfully" });
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error("Error adding HR activity:", error);
//     res.status(500).send({ message: "Internal Server Error" });
//   }
// };

// export default addHrActivity;

import mongoose from "mongoose";
import hrActivityModel from "../../model/hrActivityModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const addHrActivity = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const hrActivity = req.body;

    // Step 1: Save new HR activity inside transaction
    const newHrActivity = new hrActivityModel(hrActivity);
    await newHrActivity.save({ session });

    // Step 2: Log audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "ADD_HR_ACTIVITY",
      entityType: "hrActivity",
      newData: newHrActivity,
      description: `${req.user.username} added an HR activity`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Commit transaction (save + audit)
    await session.commitTransaction();
    session.endSession();

    // Step 3: Update cache outside transaction
    const cacheKey = `hrActivities`;
    const cachedActivities = (await getCachedData(cacheKey)) || [];
    cachedActivities.push(newHrActivity);
    await cacheResponse(cacheKey, cachedActivities);

    // Step 4: Send push notification to ALL users (no DB query needed in push function)
    await sendPushNotifications(
      "ALL_USERS",
      "HR Activity",
      `${req.user.username} has added a new HR Activity`
    );

    res.status(201).send({ message: "HR activity added successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error adding HR activity:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default addHrActivity;
