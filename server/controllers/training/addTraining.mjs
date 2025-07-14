/**
 * @swagger
 * /api/add-training:
 *   post:
 *     summary: Add a training to the user's profile
 *     description: This route allows adding a training to a user's profile. The training details such as program, date, duration, provider, and feedback must be provided. A valid session token must be included in the request for authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *               trainingProgram:
 *                 type: string
 *                 example: "Leadership Training"
 *               trainingDate:
 *                 type: string
 *                 example: "2023-08-20"
 *               duration:
 *                 type: string
 *                 example: "4 hours"
 *               trainingProvider:
 *                 type: string
 *                 example: "XYZ Corporation"
 *               feedback:
 *                 type: string
 *                 example: "The training was highly informative and beneficial."
 *     responses:
 *       201:
 *         description: Training added successfully to the user's profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Training added successfully"
 *       400:
 *         description: Missing required fields or invalid data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing required fields"
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
 *       - Training
 */

import mongoose from "mongoose";
import TrainingModel from "../../model/trainingModel.mjs";
import { cacheResponse } from "../../utils/cacheResponse.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const addTraining = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      username,
      trainingProgram,
      trainingDate,
      duration,
      trainingProvider,
      feedback,
    } = req.body;

    if (!username) {
      await session.abortTransaction();
      return res.status(400).send({ message: "Missing required fields" });
    }

    const newTraining = {
      trainingProgram,
      trainingDate,
      duration,
      trainingProvider,
      feedback,
    };

    const updatedUser = await TrainingModel.findOneAndUpdate(
      { _id: req.user._id },
      {
        $setOnInsert: {
          _id: req.user._id,
          username: req.user.username,
        },
        $push: { trainings: newTraining },
      },
      {
        new: true,
        upsert: true,
        session, // <-- add session here
      }
    );

    // Cache the updated trainings
    const updatedTrainings = updatedUser.trainings;
    const cacheKey = `trainings:${username}`;
    await cacheResponse(cacheKey, updatedTrainings);

    // Log audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "ADD_TRAINING",
      entityType: "training",
      newData: newTraining,
      description: `${req.user.username} added a training: ${trainingProgram} for ${username}.`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();

    res.status(201).send({
      message: "Training added successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("addTraining error:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

export default addTraining;
