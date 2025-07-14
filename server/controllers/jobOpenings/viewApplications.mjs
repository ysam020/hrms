/**
 * @swagger
 * /api/view-applications/{id}:
 *   get:
 *     summary: View applications for a specific job opening
 *     description: This route allows HR or admin to view all job applications for a specific job opening, excluding rejected applications.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the job opening.
 *         schema:
 *           type: string
 *           example: "64f1a4dff1b2a1c9b4e357d6"
 *     responses:
 *       200:
 *         description: Successfully fetched job applications.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: "John Doe"
 *                   mobile:
 *                     type: string
 *                     example: "+91 9876543210"
 *                   email:
 *                     type: string
 *                     example: "john.doe@example.com"
 *                   aadharNo:
 *                     type: string
 *                     example: "1234 5678 9101"
 *                   jobTitle:
 *                     type: string
 *                     example: "Software Engineer"
 *                   interviewDate:
 *                     type: string
 *                     format: date-time
 *                     example: "2024-11-15T10:00:00Z"
 *       500:
 *         description: Internal server error when fetching applications.
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

import JobApplicationModel from "../../model/jobApplicationModel.mjs";

const viewApplications = async (req, res, next) => {
  try {
    const { id } = req.params;
    const status = decodeURIComponent(req.query.status);

    const query = {
      jobTitle: id,
    };

    // Handle "null" string from query properly
    if (status !== "All") {
      query.status = status;
    }

    const applications = await JobApplicationModel.find(query);

    const jobApplications = applications.map((application) => ({
      name: application.name,
      mobile: application.mobile,
      email: application.email,
      aadharNo: application.aadharNo,
      jobTitle: application.jobTitle,
      resume: application.resume,
      interviews: application.interviews,
      status: application.status,
    }));

    res.status(200).json(jobApplications);
  } catch (err) {
    next(err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

export default viewApplications;
