/**
 * @swagger
 * /api/add-exit-feedback:
 *   post:
 *     summary: Submit exit feedback for resignation
 *     description: Allows a resigned employee to submit exit feedback. The user must have an existing resignation entry before submitting feedback.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               overall_job_satisfaction:
 *                 type: number
 *                 description: Rating for overall job satisfaction (1-10).
 *                 example: 4
 *               quality_of_communication:
 *                 type: string
 *                 description: Feedback on communication within the company.
 *                 example: "Communication was clear and transparent."
 *               support_from_manager:
 *                 type: string
 *                 description: Feedback on manager's support.
 *                 example: "Manager was always supportive and guided well."
 *               appreciation_for_work:
 *                 type: string
 *                 description: Feedback on whether the employee felt valued.
 *                 example: "Recognition for work was good but could improve."
 *               collaboration_within_the_team:
 *                 type: string
 *                 description: Feedback on teamwork and collaboration.
 *                 example: "Team collaboration was excellent."
 *               overall_company_culture:
 *                 type: string
 *                 description: Feedback on the company culture.
 *                 example: "The company culture was welcoming and inclusive."
 *               suggestions:
 *                 type: string
 *                 description: Employee's suggestions for improvement.
 *                 example: "Consider offering more flexible work arrangements."
 *     responses:
 *       201:
 *         description: Exit feedback submitted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Exit feedback submitted successfully."
 *                 resignation:
 *                   type: object
 *                   description: The updated resignation record.
 *       400:
 *         description: Bad Request - Resignation form must be filled before feedback submission.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Please fill out the resignation form first."
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
 *                   example: "An error occurred while submitting the feedback."
 *     tags:
 *       - Resignation
 */

import mongoose from "mongoose";
import ResignationModel from "../../model/resignationModel.mjs";
import { cacheResponse } from "../../utils/cacheResponse.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";

const addExitFeedback = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const username = req.user.username;

    const existingResignation = await ResignationModel.findOne({
      username,
    }).session(session);
    if (!existingResignation) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Please fill out the resignation form first.",
      });
    }

    const oldData = { ...existingResignation.toObject() };

    // Update resignation with exit feedback
    const updatedResignation = await ResignationModel.findOneAndUpdate(
      { username },
      { $set: req.body },
      { new: true, session }
    );

    // Refresh entire resignation cache
    const allResignations = await ResignationModel.find({}).session(session);
    await cacheResponse("resignations", allResignations);

    // Audit log
    await logAuditTrail({
      userId: req.user._id,
      action: "SUBMIT_EXIT_FEEDBACK",
      entityType: "resignation",
      oldData,
      newData: updatedResignation.toObject(),
      description: `${username} submitted exit feedback.`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();

    await notificationQueue.add(
      "addNotification",
      {
        title: "Resignation",
        message: `${username} submitted exit feedback.`,
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

    res.status(201).json({
      message: "Exit feedback submitted successfully.",
      resignation: updatedResignation,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("addExitFeedback error:", err);
    next(err);
  } finally {
    session.endSession();
  }
};

export default addExitFeedback;
