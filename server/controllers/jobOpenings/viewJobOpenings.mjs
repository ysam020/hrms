/**
 * @swagger
 * /api/view-job-openings:
 *   get:
 *     summary: View all job openings
 *     description: This route allows HR or admin to view the list of all available job openings.
 *     responses:
 *       200:
 *         description: Successfully fetched the list of job openings.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: "64f1a4dff1b2a1c9b4e357d6"
 *                   jobTitle:
 *                     type: string
 *                     example: "Software Engineer"
 *                   jobDescription:
 *                     type: string
 *                     example: "We are looking for a passionate software engineer to join our team."
 *                   applicationDeadline:
 *                     type: string
 *                     format: date-time
 *                     example: "2024-11-30T23:59:59Z"
 *       404:
 *         description: No job openings found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No jobs found"
 *       500:
 *         description: Internal server error when fetching job openings.
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

import JobOpeningsModel from "../../model/jobOpeneningModel.mjs";

const viewJobOpenings = async (req, res, next) => {
  try {
    const jobs = await JobOpeningsModel.find({});

    if (!jobs) {
      return res.status(404).json({ message: "No jobs found" });
    }

    res.status(200).json(jobs);
  } catch (err) {
    next(err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

export default viewJobOpenings;
