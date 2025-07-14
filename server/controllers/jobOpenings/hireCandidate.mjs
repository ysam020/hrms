/**
 * @swagger
 * /api/hire-candidate:
 *   post:
 *     summary: Hire a candidate and create a new user
 *     description: Updates the job application status, increments the hired count for the job opening, and creates a new user in the system. Sends an offer letter to the candidate. Requires session-based authentication.
 *     security:
 *       - SessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               aadharNo:
 *                 type: string
 *                 example: "123412341234"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "candidate@example.com"
 *               jobTitle:
 *                 type: string
 *                 example: "Manager"
 *               salary:
 *                 type: number
 *                 example: 50000
 *               joining_date:
 *                 type: string
 *                 format: date
 *                 example: "2025-04-15"
 *               reference_by:
 *                 type: string
 *                 example: "John Doe"
 *     responses:
 *       200:
 *         description: Candidate hired successfully and user created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Hired successfully and user created"
 *       404:
 *         description: Application or job opening not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Application not found"
 *       409:
 *         description: Candidate already hired or vacancies filled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Candidate already hired"
 *       400:
 *         description: Invalid name format.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid name format"
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Something went wrong"
 *     tags:
 *       - Recruitment
 */

import mongoose from "mongoose";
import JobApplicationModel from "../../model/jobApplicationModel.mjs";
import JobOpeningModel from "../../model/jobOpeneningModel.mjs";
import UserModel from "../../model/userModel.mjs";
import { sendOfferLetter } from "../../utils/sendOfferLetter.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import { notificationQueue } from "../../config/queueConfig.mjs";

const generateUniqueUsername = async (baseUsername, session) => {
  let uniqueUsername = baseUsername;
  let counter = 1;

  while (
    await UserModel.findOne({ username: uniqueUsername }).session(session)
  ) {
    uniqueUsername = `${baseUsername}_${counter}`;
    counter++;
  }

  return uniqueUsername;
};

const hireCandidate = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      aadharNo,
      name,
      email,
      jobTitle,
      salary,
      joining_date,
      reference_by,
      _id,
    } = req.body;

    // Find the job application
    const job = await JobApplicationModel.findOne({
      aadharNo,
      jobTitle: _id,
    }).session(session);

    if (!job) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Application not found" });
    }

    if (job.status === "Hired") {
      await session.abortTransaction();
      return res.status(409).json({ message: "Candidate already hired" });
    }

    // Update the job application status
    job.status = "Hired";
    await job.save({ session });

    // Update the job opening with the incremented hired count
    const existingJob = await JobOpeningModel.findOne({
      jobTitle: jobTitle,
      applicationDeadline: { $gte: new Date() },
    }).session(session);

    if (!existingJob) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Job opening not found" });
    }

    if (existingJob.candidatesHired >= existingJob.numberOfVacancies) {
      await session.abortTransaction();
      return res.status(409).json({
        message: "All vacancies have been filled for this job",
      });
    }

    existingJob.candidatesHired += 1;
    await existingJob.save({ session });

    // Add new user to the UserModel
    const nameParts = job.name.split(" ");
    let first_name,
      middle_name = null,
      last_name = null;

    if (nameParts.length === 1) {
      first_name = nameParts[0];
      last_name = "";
    } else if (nameParts.length === 2) {
      [first_name, last_name] = nameParts;
    } else if (nameParts.length > 2) {
      first_name = nameParts[0];
      last_name = nameParts[nameParts.length - 1];
      middle_name = nameParts.slice(1, -1).join(" ");
    } else {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid name format" });
    }

    const baseUsername = last_name ? `${first_name}_${last_name}` : first_name;
    const username = await generateUniqueUsername(baseUsername, session);

    const password = process.env.DEFAULT_PASSWORD;

    const rankMapping = {
      MD: 1,
      PROPRIETOR: 1,
      "CENTER HEAD": 1,
      HOD: 1,
      "BACK OFFICE MANAGER": 2,
      "OPERATION MANAGER": 2,
      MANAGER: 2,
      AM: 2,
      "HR MANAGER": 2,
      "HR ADMIN": 2,
      "HR-BACK OFFICE EXECUTIVE": 3,
      "BACK OFFICE EXECUTIVE": 3,
      "HR EXECUTIVE": 3,
      "HR & BACKEND": 3,
      "FIELD EXECUTIVE": 4,
      "TEAM LEADER": 3,
      ATL: 3,
      "MIS EXECUTIVE": 3,
      "Q.A.": 3,
      TRAINER: 3,
      TELECALLER: 4,
      "HOUSE KEEPING": 4,
      GUARD: 4,
    };

    const cleanJobTitle =
      typeof jobTitle === "string" ? jobTitle.trim().toUpperCase() : null;

    if (
      !cleanJobTitle ||
      !Object.prototype.hasOwnProperty.call(rankMapping, cleanJobTitle)
    ) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ message: "Invalid or unsupported job title" });
    }

    const rank = rankMapping[cleanJobTitle];

    const newUser = new UserModel({
      first_name: first_name,
      middle_name: middle_name ? middle_name : "",
      last_name: last_name ? last_name : "",
      designation: jobTitle,
      salary,
      joining_date,
      reference_by,
      username,
      password,
      rank,
    });

    await newUser.save({ session });

    // Log the audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "HIRE_CANDIDATE",
      entityType: "jobOpening",
      newData: { name, email, jobTitle, salary, joining_date, reference_by },
      description: `${req.user.username} hired ${name} for ${jobTitle}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await sendOfferLetter(job.name, email, jobTitle, salary, joining_date);
    // Commit the transaction
    await session.commitTransaction();

    await notificationQueue.add(
      "addNotification",
      {
        title: "Recruitment",
        message: `${req.user.username} has hired a candidate for ${jobTitle}`,
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

    res.status(200).json({ message: "Hired successfully and user created" });
  } catch (err) {
    await session.abortTransaction();
    next(err);
    res.status(500).json({ message: "Something went wrong" });
  } finally {
    session.endSession();
  }
};

export default hireCandidate;
