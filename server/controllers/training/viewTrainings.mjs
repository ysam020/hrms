/**
 * @swagger
 * /api/view-trainings/{username}:
 *   get:
 *     summary: View a user's trainings
 *     description: This route allows fetching a user's training history. It checks if the data is cached; if not, it retrieves the trainings from the database. A valid session token must be included for authentication.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: The username of the user whose training history is to be fetched.
 *     responses:
 *       200:
 *         description: Successfully fetched the user's training history
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   trainingProgram:
 *                     type: string
 *                   trainingDate:
 *                     type: string
 *                   duration:
 *                     type: string
 *                   trainingProvider:
 *                     type: string
 *                   feedback:
 *                     type: string
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       401:
 *         description: Unauthorized, No token provided or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized: No token provided"
 *       500:
 *         description: Internal server error if something goes wrong.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Something went wrong"
 *     tags:
 *       - Training
 */

import TrainingModel from "../../model/trainingModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";
import { sanitizeData } from "../../utils/sanitizer.mjs";

const viewTrainings = async (req, res) => {
  try {
    const { username } = req.params;

    // Validate username (alphanumeric + underscore, dot, hyphen)
    if (!username || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).send("Invalid username format");
    }

    const cacheKey = `trainings:${username}`;

    // Try to fetch from cache
    let trainingData = await getCachedData(cacheKey);
    if (trainingData) {
      const sanitized = sanitizeData(trainingData);
      return res.status(200).json(sanitized);
    }

    // Fetch from DB
    const user = await TrainingModel.findOne({ username });
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Convert Mongoose subdocuments (trainings) to plain objects
    const plainTrainings = user.trainings.map((t) =>
      t.toObject ? t.toObject() : t
    );

    const sanitizedTrainings = sanitizeData(plainTrainings);

    // Cache the sanitized data
    await cacheResponse(cacheKey, sanitizedTrainings);

    // Return response
    res.status(200).json(sanitizedTrainings);
  } catch (error) {
    console.error("viewTrainings error:", error);
    res.status(500).send("Internal Server Error");
  }
};

export default viewTrainings;
