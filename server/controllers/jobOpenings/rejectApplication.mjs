/**
 * @swagger
 * /api/reject-application:
 *   put:
 *     summary: Reject a job application
 *     description: This route allows an authorized user to reject a job application by specifying the applicant's Aadhaar number and the job title.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               aadharNo:
 *                 type: string
 *                 example: "000000000000"
 *               jobTitle:
 *                 type: string
 *                 example: "Software Engineer"
 *               reason:
 *                 type: string
 *                 example: "Did not meet requirements"
 *     responses:
 *       200:
 *         description: Application successfully rejected.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Application rejected"
 *       404:
 *         description: Application not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Application not found"
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
import logAuditTrail from "../../utils/auditLogger.mjs";

const rejectApplication = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { aadharNo, name, jobTitle, reason, _id } = req.body;

    const job = await JobApplicationModel.findOne(
      {
        aadharNo,
        jobTitle: _id,
      },
      null,
      { session }
    );

    if (!job) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Application not found" });
    }

    // Clone the state before modification
    const oldData = { ...job.toObject() };

    // Modify and save
    job.status = "Rejected";
    job.reason = reason;
    await job.save({ session });

    // Clone updated state
    const newData = { ...job.toObject() };

    // Log audit
    await logAuditTrail({
      userId: req.user._id,
      action: "REJECT_APPLICATION",
      entityType: "jobApplication",
      oldData,
      newData,
      description: `${req.user.username} rejected candidate ${name}'s application for job: ${jobTitle}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Application rejected" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Reject error:", err);
    res.status(500).json({ message: "Something went wrong" });
    next(err);
  }
};

export default rejectApplication;
