import UserModel from "../../model/userModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";

const deleteCalendarEvent = async (req, res) => {
  try {
    const username = req.user.username;
    const { _id } = req.params;
    const cacheKey = `calendar_events:${username}`;

    // Remove the event from MongoDB
    const user = await UserModel.findOneAndUpdate(
      { username },
      { $pull: { events: { _id } } },
      { new: true } // Return the updated document
    );

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // Fetch cached events, update, and re-cache
    let cachedEvents = await getCachedData(cacheKey);
    if (cachedEvents) {
      cachedEvents = cachedEvents.filter((event) => event._id !== _id); // Remove the deleted event
      await cacheResponse(cacheKey, cachedEvents); // Update cache
    }

    res.status(200).send({ message: "Event deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default deleteCalendarEvent;
