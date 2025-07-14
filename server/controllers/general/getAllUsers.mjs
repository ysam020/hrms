/**
 * @swagger
 * /api/get-all-users:
 *   get:
 *     summary: Retrieve all users
 *     description: This route retrieves a list of all users from the database.
 *     responses:
 *       200:
 *         description: A list of users was successfully retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: "6672a2501aa931b68b091faf"
 *                   username:
 *                     type: string
 *                     example: "user_name"
 *       500:
 *         description: Internal server error when fetching users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while fetching users. Please try again later."
 *     tags:
 *       - Admin
 */

import UserModel from "../../model/userModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";

const getAllUsers = async (req, res) => {
  try {
    const cacheKey = `userList`;

    // Check if there is already cached data
    const cachedData = await getCachedData(cacheKey);
    if (cachedData && cachedData.length > 0) {
      console.log("Returning cached user data");
      return res.status(200).send(cachedData);
    }

    const users = await UserModel.find({})
      .select("-_id username")
      .sort({ username: 1 }) // 1 = ascending (A-Z), -1 = descending (Z-A)
      .lean();

    await cacheResponse(cacheKey, users);
    console.log("Fetched and cached user data");
    res.status(200).send(users);
  } catch (error) {
    console.error("Error in getAllUsers:", error);
    res.status(500).send({
      message:
        "An error occurred while fetching users. Please try again later.",
    });
  }
};

export default getAllUsers;
