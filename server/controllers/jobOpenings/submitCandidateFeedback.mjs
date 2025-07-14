import mongoose from "mongoose";
import JobApplicationModel from "../../model/jobApplicationModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";

const submitCandidateFeedback = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { feedback, jobTitle, name, aadharNo, interviewRound, _id } =
      req.body;

    const jobApplication = await JobApplicationModel.findOne({
      jobTitle: _id,
      aadharNo,
    }).session(session);

    if (!jobApplication) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Job application not found" });
    }

    const roundIndex = jobApplication.interviews.findIndex(
      (r) => r.roundNumber === interviewRound
    );

    if (roundIndex === -1) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Interview round not found" });
    }

    const interview = jobApplication.interviews[roundIndex];

    if (!interview.interviewConducted) {
      await session.abortTransaction();
      return res.status(400).json({
        message:
          "Feedback cannot be submitted before the interview is conducted",
      });
    }

    if (interview.feedback && interview.feedback.trim() !== "") {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Feedback has already been submitted for this round",
      });
    }

    interview.feedback = feedback;

    // Audit log
    await logAuditTrail({
      userId: req.user._id,
      action: "SUBMIT_CANDIDATE_FEEDBACK",
      entityType: "jobApplication",
      newData: {
        feedback,
        jobTitle,
        aadharNo,
        interviewRound,
      },
      description: `${req.user.username} submitted feedback for round ${interviewRound} of ${name} with Aadhar No. ${aadharNo} for job title ${jobTitle}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await jobApplication.save({ session });
    await session.commitTransaction();

    await notificationQueue.add(
      "addNotification",
      {
        title: "Recruitment",
        message: `${req.user.username} submitted feedback for round ${interviewRound} of ${name} with Aadhar No. ${aadharNo} for job title ${jobTitle}`,
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

    res.status(200).json({ message: "Feedback submitted successfully" });
  } catch (err) {
    await session.abortTransaction();
    next(err);
    res.status(500).json({ message: "Something went wrong" });
  } finally {
    session.endSession();
  }
};

export default submitCandidateFeedback;
