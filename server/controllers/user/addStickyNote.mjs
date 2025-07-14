import UserModel from "../../model/userModel.mjs";
import { cacheResponse } from "../../utils/cacheResponse.mjs";

const addStickyNote = async (req, res) => {
  try {
    const { note } = req.body;
    const username = req.user.username;
    const cacheKey = `sticky_note:${username}`;

    // Find user and update note
    const updatedNote = await UserModel.findOneAndUpdate(
      { username },
      { note },
      { new: true } // Return updated document
    );

    if (!updatedNote) {
      return res.status(404).send({ message: "User not found" });
    }

    // Update cache with new note
    await cacheResponse(cacheKey, updatedNote.note);

    res
      .status(200)
      .send({ message: "Updated successfully", data: updatedNote });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default addStickyNote;
