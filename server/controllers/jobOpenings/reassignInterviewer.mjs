import mongoose from "mongoose";
import JobApplicationModel from "../../model/jobApplicationModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const reassignInterviewer = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { interviewer, jobTitle, name, aadharNo, interviewRound, _id } =
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

    jobApplication.interviews[roundIndex].interviewer = interviewer;

    // Audit log
    await logAuditTrail({
      userId: req.user._id,
      action: "REASSIGN_INTERVIEWER",
      entityType: "jobApplication",
      oldData: {
        interviewer: jobApplication.interviews[roundIndex].interviewer,
        jobTitle,
        aadharNo,
        interviewRound,
      },
      newData: {
        interviewer,
        jobTitle,
        aadharNo,
        interviewRound,
      },
      description: `${req.user.username} reassigned interviewer for round ${interviewRound} of ${name} with Aadhar No. ${aadharNo} to ${interviewer}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await jobApplication.save({ session });
    await session.commitTransaction();

    await sendPushNotifications(
      interviewer,
      "Interview Scheduled",
      `You have been assigned to conduct an interview for ${jobTitle}`
    );

    res.status(200).json({ message: "Interviewer reassigned successfully" });
  } catch (err) {
    await session.abortTransaction();
    next(err);
    res.status(500).json({ message: "Something went wrong" });
  } finally {
    session.endSession();
  }
};

export default reassignInterviewer;
