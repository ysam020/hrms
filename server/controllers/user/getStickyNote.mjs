import UserModel from "../../model/userModel.mjs";
import { getCachedData, cacheResponse } from "../../utils/cacheResponse.mjs";

const getStickyNote = async (req, res) => {
  try {
    const username = req.user.username;
    const cacheKey = `sticky_note:${username}`;

    // Check Redis cache first
    let cachedNote = await getCachedData(cacheKey);
    if (cachedNote) {
      return res.status(200).send(cachedNote);
    }

    // Fetch from MongoDB if not found in cache
    const user = await UserModel.findOne({ username }).select("note");
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // Store in Redis cache
    await cacheResponse(cacheKey, user.note);

    res.status(200).send(user.note);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default getStickyNote;
