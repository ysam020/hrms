import UserModel from "../../model/userModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";

const getCalendarEvents = async (req, res) => {
  try {
    const username = req.user.username;
    const cacheKey = `calendar_events:${username}`;

    // Check if data exists in Redis cache
    const cachedEvents = await getCachedData(cacheKey);
    if (cachedEvents) {
      return res.status(200).send(cachedEvents);
    }

    // Fetch the user and events from MongoDB
    const user = await UserModel.findOne({ username }).select("events");
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Sort events by date (ascending order)
    user.events.sort((a, b) => a.date.localeCompare(b.date));

    // Cache the result for 1 hour
    await cacheResponse(cacheKey, user.events);

    res.status(200).send(user.events);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default getCalendarEvents;
