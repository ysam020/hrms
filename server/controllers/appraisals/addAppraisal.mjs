import mongoose from "mongoose";
import AppraisalModel from "../../model/appraisalModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";

const addAppraisal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { score, strengths, areasOfImprovement } = req.body;

    // Input validation
    if (!score || !strengths || !areasOfImprovement) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).send({ message: "Missing required fields" });
    }

    const appraisalDate = new Date().toISOString().split("T")[0];

    const newAppraisal = {
      appraisalDate,
      score,
      strengths,
      areasOfImprovement,
    };

    // Upsert and push new appraisal inside the transaction
    await AppraisalModel.findOneAndUpdate(
      { username: req.user.username },
      {
        $setOnInsert: { username: req.user.username },
        $push: { appraisals: newAppraisal },
      },
      {
        new: true,
        upsert: true,
        session,
      }
    );

    // Log the audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "ADD_APPRAISAL",
      entityType: "appraisal",
      newData: newAppraisal,
      description: `${req.user.username} added an appraisal`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Commit transaction first
    await session.commitTransaction();
    session.endSession();

    // Add notification job to queue (after successful transaction)
    await notificationQueue.add("addNotification", {
      title: "Appraisal",
      message: `${req.user.username} has added a new appraisal with score: ${score}`,
    });

    res.status(201).send({
      message: "Appraisal added successfully",
      appraisal: newAppraisal,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in addAppraisal:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default addAppraisal;
