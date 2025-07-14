import mongoose from "mongoose";
import JobApplicationModel from "../../model/jobApplicationModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";

const statusRank = {
  Applied: 0,
  "Round 1 Completed": 1,
  "Round 1 Cleared": 2,
  "Round 2 Completed": 3,
  "Round 2 Cleared": 4,
};

const updateCandidateStatus = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { _id, status, interviewRound, aadharNo } = req.body;

    const application = await JobApplicationModel.findOne({
      jobTitle: _id,
      aadharNo,
    }).session(session);

    if (!application) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "No application found for this candidate." });
    }

    const currentStatus = application.status || "Applied";
    const currentRank = statusRank[currentStatus] ?? 0;

    const newStatus = `Round ${interviewRound} ${status}`;
    const newRank = statusRank[newStatus];

    if (newRank === undefined) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: `Invalid status provided. Please choose one of the following: ${Object.keys(
          statusRank
        ).join(", ")}`,
      });
    }

    if (newRank !== currentRank + 1) {
      let errorMessage = "";

      if (
        newStatus === "Round 1 Cleared" &&
        currentStatus !== "Round 1 Completed"
      ) {
        errorMessage = `Cannot update status. Please ensure the interview has been conducted for Round 1 before proceeding.`;
      } else if (
        newStatus === "Round 2 Completed" &&
        currentStatus !== "Round 1 Cleared"
      ) {
        errorMessage = `Cannot update status. The candidate must clear Round 1 before moving to Round 2.`;
      } else if (
        newStatus === "Round 2 Cleared" &&
        currentStatus !== "Round 2 Completed"
      ) {
        errorMessage = `Cannot update status. Please ensure the interview has been conducted for Round 2 before proceeding.`;
      } else {
        const allowedNextStatus = Object.entries(statusRank).find(
          ([, rank]) => rank === currentRank + 1
        )?.[0];

        errorMessage = `The candidate's current status is '${currentStatus}'. Please follow the step-by-step status progression. The next allowed status is '${allowedNextStatus}'.`;
      }

      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: errorMessage });
    }

    if (
      status.toLowerCase() === "completed" &&
      currentStatus.toLowerCase() === `round ${interviewRound} cleared`
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: `This candidate has already cleared Round ${interviewRound}. You cannot mark it as 'Completed' again.`,
      });
    }

    if (
      interviewRound === 1 &&
      currentRank >= statusRank["Round 2 Completed"]
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: `This candidate has already appeared for Round 2. You cannot change the status for Round 1 anymore.`,
      });
    }

    const interview = application.interviews.find(
      (intv) => intv.roundNumber === interviewRound
    );

    if (!interview) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: `Interview details for Round ${interviewRound} are missing. Please make sure the round has been scheduled.`,
      });
    }

    if (status.toLowerCase() === "cleared") {
      if (!interview.interviewConducted) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: `You can only mark Round ${interviewRound} as 'Cleared' after the interview is conducted.`,
        });
      }

      if (!interview.feedback || interview.feedback.trim() === "") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: `Please provide feedback before marking Round ${interviewRound} as cleared.`,
        });
      }
    }

    if (status.toLowerCase() === "completed") {
      interview.interviewConducted = true;
    }

    const oldStatus = application.status;
    application.status = newStatus;
    await application.save({ session });

    await logAuditTrail(
      {
        userId: req.user._id,
        action: "UPDATE_CANDIDATE_STATUS",
        entityType: "jobApplication",
        entityId: application._id,
        oldData: { status: oldStatus },
        newData: { status: newStatus },
        description: `${req.user.username} updated candidate status from '${oldStatus}' to '${newStatus}' for Round ${interviewRound} (Candidate: ${application.name}, Aadhar: ${application.aadharNo})`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      session
    );

    await session.commitTransaction();
    session.endSession();

    const message =
      status.toLowerCase() === "completed"
        ? "Status updated, please provide candidate feedback."
        : "Candidate status updated successfully.";

    await notificationQueue.add(
      "addNotification",
      {
        title: "Recruitment",
        message: `${req.user.username} updated candidate status from '${oldStatus}' to '${newStatus}' for Round ${interviewRound} (Candidate: ${application.name})`,
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

    return res.status(200).json({ message });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Status update error:", err);
    res.status(500).json({
      message:
        "Something went wrong while updating the candidate status. Please try again later.",
    });
    next(err);
  }
};

export default updateCandidateStatus;
