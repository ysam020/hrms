/**
 * @swagger
 * /api/get-hr-activities:
 *   get:
 *     summary: Get HR activities for today and onwards
 *     description: This route fetches HR activities for today and onwards. It first checks if the data is available in the cache; if not, it retrieves it from the database. A valid session token is required for authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully fetched HR activities
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   title:
 *                     type: string
 *                   description:
 *                     type: string
 *                   date:
 *                     type: string
 *                     example: "2023-08-15"
 *                   time:
 *                     type: string
 *                     example: "10:00 AM"
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
 *       - HR Activities
 */

import hrActivityModel from "../../model/hrActivityModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";

const getHrActivities = async (req, res) => {
  try {
    const { all } = req.query;
    const fetchAll = all === "true";

    // Use different cache keys for different data sets
    const cacheKey = fetchAll ? `allHrActivities` : `hrActivities`;
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      return res.status(200).send(cachedData);
    }

    let data;

    if (fetchAll) {
      // Fetch all HR activities without date filter
      data = await hrActivityModel.find({}).sort({ date: 1 }); // Sort by date descending (newest first)
    } else {
      // Get today's date in yyyy-mm-dd format and fetch current/future activities
      const today = new Date().toISOString().split("T")[0];
      data = await hrActivityModel
        .find({ date: { $gte: today } })
        .sort({ date: 1 }); // Sort by date ascending (upcoming first)
    }

    await cacheResponse(cacheKey, data);
    res.status(200).send(data);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default getHrActivities;
