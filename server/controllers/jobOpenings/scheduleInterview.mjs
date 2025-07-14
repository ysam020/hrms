/**
 * @swagger
 * /api/schedule-interview:
 *   put:
 *     summary: Schedule an interview and send an email invite
 *     description: This route schedules an interview for a job application and sends an email to the candidate with an ICS calendar invite.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jobTitle:
 *                 type: string
 *                 example: "Software Engineer"
 *               email:
 *                 type: string
 *                 example: "candidate@example.com"
 *               interviewDateTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-11-15T10:00:00Z"
 *               interviewStartTime:
 *                 type: string
 *                 format: time
 *                 example: "10:00:00"
 *               interviewEndTime:
 *                 type: string
 *                 format: time
 *                 example: "11:00:00"
 *     responses:
 *       200:
 *         description: Interview successfully scheduled and email sent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Interview scheduled"
 *       404:
 *         description: Job application not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Application not found"
 *       500:
 *         description: Internal server error when sending the email or saving the interview date.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to schedule interview"
 *     tags:
 *       - Recruitment
 */

import mongoose from "mongoose";
import JobApplicationModel from "../../model/jobApplicationModel.mjs";
import transporter from "../../utils/transporter.mjs";
import { Buffer } from "buffer";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const scheduleInterview = async (req, res, next) => {
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
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.status === "Hired") {
      await session.abortTransaction();
      return res.status(409).json({ message: "Candidate already hired" });
    }

    const interviewDate = new Date(interviewDateTime);
    if (isNaN(interviewDate.getTime())) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid interview date" });
    }

    const roundNumber = application.interviews.length + 1;

    if (application.interviews.some((i) => i.roundNumber === roundNumber)) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ message: `Round ${roundNumber} already scheduled` });
    }

    if (roundNumber > 1) {
      const prevRound = application.interviews.find(
        (i) => i.roundNumber === roundNumber - 1
      );
      if (!prevRound || !prevRound.interviewConducted) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Previous round of interview was not conducted. Cannot schedule round ${roundNumber}`,
        });
      }
    }

    const readableStartTime = `${interviewStartTime.slice(
      9,
      11
    )}:${interviewStartTime.slice(11, 13)}`;
    const readableEndTime = `${interviewEndTime.slice(
      9,
      11
    )}:${interviewEndTime.slice(11, 13)}`;

    const newInterview = {
      roundNumber,
      interviewDate: interviewDate
        .toLocaleDateString("en-GB")
        .replace(/\//g, "-"),
      interviewStartTime: readableStartTime,
      interviewEndTime: readableEndTime,
      interviewer,
      interviewConducted: false,
    };

    application.interviews.push(newInterview);
    application.status = `Round ${roundNumber} Scheduled`;

    await application.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: "SCHEDULE_INTERVIEW",
      entityType: "jobApplication",
      newData: {
        roundNumber,
        interviewDate: newInterview.interviewDate,
        interviewStartTime,
        interviewEndTime,
        interviewer,
        interviewConducted: false,
        applicationId: _id,
      },
      description: `${req.user.username} scheduled round ${roundNumber} interview for ${application.name}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    // ICS calendar invite generation
    const icsContent = `
      BEGIN:VCALENDAR
      VERSION:2.0
      CALSCALE:GREGORIAN
      BEGIN:VEVENT
      SUMMARY:Paymaster Interview - Round ${roundNumber}
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

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: application.email,
      subject: `Round ${roundNumber} Interview Scheduled for ${application.jobTitle}`,
      html: `
        <p>Dear ${application.name},</p>
        <p>Your round ${roundNumber} interview for the position of <strong>${
        application.jobTitle
      }</strong> is scheduled for
        <strong>${interviewDate.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        })}</strong>.</p>
        <p>Please find the calendar invite attached.</p>
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
        message: `${req.user.username} scheduled round ${roundNumber} interview for ${application.name}`,
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
      "Interview Scheduled",
      `Your interview of ${application.name} has been scheduled on ${newInterview.interviewDate} at ${readableStartTime} - ${readableEndTime}.`
    );

    return res
      .status(200)
      .json({ message: "Interview scheduled successfully" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Schedule error:", err);
    res.status(500).json({ message: "Failed to schedule interview" });
    next(err);
  }
};

export default scheduleInterview;
