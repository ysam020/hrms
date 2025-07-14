/**
 * @swagger
 * /api/apply-for-job:
 *   post:
 *     summary: Apply for a job
 *     description: This route allows users to apply for a job. It checks if the user has already applied for the same job using their email, mobile number, or Aadhar number. If an existing application is found, the user will be informed that they have already applied.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               mobile:
 *                 type: string
 *                 example: "+919876543210"
 *               email:
 *                 type: string
 *                 example: "johndoe@example.com"
 *               aadharNo:
 *                 type: stringnumber).
 *                 example: "1234-5678-9101"
 *               jobTitle:
 *                 type: string
 *                 example: "Software Engineer"
 *     responses:
 *       409:
 *         description: The user has already applied for the job with the provided email, mobile, or Aadhar number.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "You have already applied for this job."
 *       200:
 *         description: Bad Request. The request body may have validation errors or missing fields.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Application submitted successfully!"
 *       500:
 *         description: Internal Server Error. An error occurred while processing the application.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while submitting your application. Please try again later."
 *     tags:
 *       - Recruitment
 */

import JobApplicationModel from "../../model/jobApplicationModel.mjs";
import JobOpeningModel from "../../model/jobOpeneningModel.mjs";

const applyForJob = async (req, res) => {
  try {
    const { name, mobile, email, aadharNo, jobTitle, resume } = req.body;

    // Check if an application with the same jobTitle and any of email, mobile, or aadharNo exists
    const existingApplication = await JobApplicationModel.findOne({
      jobTitle,
      aadharNo,
    });

    if (existingApplication) {
      return res
        .status(409)
        .json({ message: "You have already applied for this job." });
    }

    // Verify job opening exists
    const jobOpening = await JobOpeningModel.findById(jobTitle);
    if (!jobOpening) {
      return res.status(404).json({ message: "Job opening not found." });
    }

    // Create a new job application
    const newApplication = new JobApplicationModel({
      name,
      mobile,
      email,
      aadharNo,
      jobTitle: jobOpening._id,
      resume,
      status: "Applied",
    });

    // Save the application first
    const savedApplication = await newApplication.save();

    res.status(200).json({
      message: "Application submitted successfully!",
      applicationId: savedApplication._id,
    });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({
        message:
          "An error occurred while submitting your application. Please try again later.",
      });
    }
  }
};

export default applyForJob;
