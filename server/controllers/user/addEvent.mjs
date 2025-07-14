import UserModel from "../../model/userModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";

const addEvent = async (req, res) => {
  try {
    const username = req.user.username;
    const event = req.body;
    const cacheKey = `calendar_events:${username}`;

    // Find the user in MongoDB
    const user = await UserModel.findOne({ username });
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Add the event to the user's event list
    user.events.push(event);
    await user.save();

    // Fetch cached events, update, and re-cache
    let cachedEvents = await getCachedData(cacheKey);
    if (cachedEvents) {
      cachedEvents.push(event); // Append the new event
      cachedEvents.sort((a, b) => a.date.localeCompare(b.date)); // Keep sorted
      await cacheResponse(cacheKey, cachedEvents); // Update cache
    } else {
      await cacheResponse(cacheKey, user.events); // If no cache, store fresh data
    }

    res.status(201).send({ message: "Event added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default addEvent;
