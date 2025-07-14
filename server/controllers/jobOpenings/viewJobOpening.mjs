/**
 * @swagger
 * /api/view-job-opening/{id}:
 *   get:
 *     summary: View details of a specific job opening
 *     description: This route allows HR or admin to view the details of a specific job opening based on the provided job ID.
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
 *         description: Successfully fetched job opening details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: "64f1a4dff1b2a1c9b4e357d6"
 *                 jobTitle:
 *                   type: string
 *                   example: "Software Engineer"
 *                 jobDescription:
 *                   type: string
 *                   example: "We are looking for a passionate software engineer to join our team."
 *                 applicationDeadline:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-11-30T23:59:59Z"
 *       404:
 *         description: Job opening not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Job not found"
 *       500:
 *         description: Internal server error when fetching the job opening.
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

const viewJobOpening = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await JobOpeningsModel.findById(id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.status(200).json(job);
  } catch (err) {
    next(err);
    res.status(500).json({ message: "Something went wrong" });
  }
};
export default viewJobOpening;
