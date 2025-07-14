import mongoose from "mongoose";
import JobApplicationModel from "../../model/jobApplicationModel.mjs";
import transporter from "../../utils/transporter.mjs";
import { Buffer } from "buffer";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const rescheduleInterview = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      _id,
      name,
      email,
      interviewDateTime,
      interviewStartTime,
      interviewEndTime,
      interviewer,
    } = req.body;

    const application = await JobApplicationModel.findOne({
      jobTitle: _id,
      name,
      email,
    }).session(session);

    if (!application) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.status === "Hired") {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({ message: "Candidate already hired" });
    }

    const interviewDate = new Date(interviewDateTime);
    if (isNaN(interviewDate.getTime())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid interview date" });
    }

    const interviewToReschedule = [...application.interviews]
      .reverse()
      .find((i) => i.interviewConducted === false);

    if (!interviewToReschedule) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "No upcoming interview to reschedule" });
    }

    const oldData = {
      roundNumber: interviewToReschedule.roundNumber,
      interviewDate: interviewToReschedule.interviewDate,
      interviewStartTime: interviewToReschedule.interviewStartTime,
      interviewEndTime: interviewToReschedule.interviewEndTime,
      interviewer: interviewToReschedule.interviewer,
      interviewConducted: interviewToReschedule.interviewConducted,
      applicationId: _id,
    };

    const readableStartTime = `${interviewStartTime.slice(
      9,
      11
    )}:${interviewStartTime.slice(11, 13)}`;
    const readableEndTime = `${interviewEndTime.slice(
      9,
      11
    )}:${interviewEndTime.slice(11, 13)}`;

    interviewToReschedule.interviewDate = interviewDate
      .toLocaleDateString("en-GB")
      .replace(/\//g, "-");
    interviewToReschedule.interviewStartTime = readableStartTime;
    interviewToReschedule.interviewEndTime = readableEndTime;
    interviewToReschedule.interviewer = interviewer;

    application.status = `Round ${interviewToReschedule.roundNumber} Rescheduled`;

    await application.save({ session });

    // Log audit inside transaction
    await logAuditTrail({
      userId: req.user._id,
      action: "SCHEDULE_INTERVIEW",
      entityType: "jobApplication",
      oldData,
      newData: {
        roundNumber: interviewToReschedule.roundNumber,
        interviewDate: interviewToReschedule.interviewDate,
        interviewStartTime: readableStartTime,
        interviewEndTime: readableEndTime,
        interviewer,
        interviewConducted: false,
        applicationId: _id,
      },
      description: `${req.user.username} rescheduled round ${interviewToReschedule.roundNumber} interview for ${application.name}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    //  ICS calendar invite content
    const icsContent = `
      BEGIN:VCALENDAR
      VERSION:2.0
      CALSCALE:GREGORIAN
      BEGIN:VEVENT
      SUMMARY:Paymaster Interview - Round ${interviewToReschedule.roundNumber} (Rescheduled)
      DTSTART;TZID=Asia/Kolkata:${interviewStartTime}
      DTEND;TZID=Asia/Kolkata:${interviewEndTime}
      LOCATION:Paymaster Management Solutions, 2nd Floor, Maradia Plaza, CG Road, Ahmedabad, Gujarat, 380006
      DESCRIPTION:Interview for ${application.jobTitle} with ${application.name}
      STATUS:CONFIRMED
      SEQUENCE:0
      BEGIN:VALARM
      TRIGGER:-PT1H
      DESCRIPTION:Interview Reminder
      ACTION:DISPLAY
      END:VALARM
      END:VEVENT
      END:VCALENDAR
    `.trim();

    const icsBuffer = Buffer.from(icsContent, "utf-8");

    // Send mail
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: application.email,
      subject: `Round ${interviewToReschedule.roundNumber} Interview Rescheduled for ${application.jobTitle}`,
      html: `
        <p>Dear ${application.name},</p>
        <p>Your round ${
          interviewToReschedule.roundNumber
        } interview for the position of <strong>${
        application.jobTitle
      }</strong> has been rescheduled to
        <strong>${interviewDate.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        })}</strong>.</p>
        <p>Please find the updated calendar invite attached.</p>
        <br />
        <p>Best regards,<br />HR Team</p>
      `,
      attachments: [
        {
          filename: "interview.ics",
          content: icsBuffer,
          contentType: "text/calendar",
        },
      ],
    });

    await notificationQueue.add(
      "addNotification",
      {
        title: "Recruitment",
        message: `${req.user.username} rescheduled round ${interviewToReschedule.roundNumber} interview for ${application.name}`,
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

    await sendPushNotifications(
      interviewer,
      "Interview Recheduled",
      `Your interview of ${application.name} has been rescheduled to ${interviewToReschedule.interviewDate} at ${interviewToReschedule.interviewStartTime} - ${interviewToReschedule.interviewEndTime}.`
    );

    return res
      .status(200)
      .json({ message: "Interview rescheduled successfully" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Reschedule error:", err);
    res.status(500).json({ message: "Failed to reschedule interview" });
    next(err);
  }
};

export default rescheduleInterview;
