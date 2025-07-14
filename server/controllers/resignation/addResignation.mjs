/**
 * @swagger
 * /api/add-resignation:
 *   post:
 *     summary: Apply for resignation
 *     description: Allows employees to submit their resignation. A user can apply only if they haven't already resigned or if their last resignation period has ended.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: The reason for resignation.
 *                 example: "Looking for better career opportunities."
 *     responses:
 *       201:
 *         description: Resignation form submitted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Form submitted successfully"
 *       400:
 *         description: Bad Request - User has already applied for resignation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "You have already applied for resignation"
 *       404:
 *         description: Not Found - User does not exist.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       401:
 *         description: Unauthorized - User is not authenticated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access"
 *       500:
 *         description: Internal Server Error - An unexpected error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while submitting the form"
 *     tags:
 *       - Resignation
 */

import mongoose from "mongoose";
import ResignationModel from "../../model/resignationModel.mjs";
import UserModel from "../../model/userModel.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";
import { cacheResponse } from "../../utils/cacheResponse.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const addResignation = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const username = req.user.username;
    const _id = new mongoose.Types.ObjectId();

    const user = await UserModel.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    const existingResignation = await ResignationModel.findOne({
      username,
      status: { $nin: ["Withdrawn", "Rejected"] },
    }).session(session);

    if (existingResignation) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "You have already submitted resignation form",
      });
    }

    const resignation_date = new Date().toISOString().split("T")[0];
    const resignationData = {
      ...req.body,
      username,
      resignation_date,
      status: "Submitted",
    };

    // Upsert resignation document
    const newResignation = await ResignationModel.findOneAndUpdate(
      { username },
      {
        $set: { ...resignationData },
        $setOnInsert: { _id },
      },
      { upsert: true, new: true, session }
    );

    // Update cache
    const resignations = await ResignationModel.find({}).session(session);
    await cacheResponse("resignations", resignations);

    // Audit log
    await logAuditTrail({
      userId: req.user._id,
      action: "SUBMIT_RESIGNATION",
      entityType: "resignation",
      newData: newResignation.toObject(),
      description: `${username} submitted a resignation form.`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();

    // Add notification to queue - it will be processed by Redis-enabled worker
    await notificationQueue.add(
      "addNotification",
      {
        title: "Resignation Submitted",
        message: `${username} submitted a resignation form.`,
        eventType: "resignation",
        targetUser: ["sameer_yadav", "mangilal_mali"],
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

    // Optional: Send immediate notification to HR/Admin users using Redis adapter
    const redisAdapter = req.app.get("redisAdapter");
    if (redisAdapter) {
      // You can also send direct notifications to specific users
      await redisAdapter.sendToUser("admin", "resignation-alert", {
        message: `${username} submitted a resignation form.`,
        resignationId: newResignation._id,
        timestamp: new Date(),
      });
    }

    res.status(201).json({
      message: "Form submitted successfully",
      resignationId: newResignation._id,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("addResignation error:", err);
    next(err);
  } finally {
    session.endSession();
  }
};

export default addResignation;
