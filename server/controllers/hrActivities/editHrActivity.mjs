import mongoose from "mongoose";
import hrActivityModel from "../../model/hrActivityModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const editHrActivity = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { _id } = req.params;
    const modifiedHrActivity = req.body;

    // Step 1: Fetch original document within session
    const existingHrActivity = await hrActivityModel
      .findById(_id)
      .session(session);
    if (!existingHrActivity) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send("HR activity not found");
    }

    const oldData = existingHrActivity.toObject();

    // Step 2: Update the document inside session
    const updatedHrActivity = await hrActivityModel.findByIdAndUpdate(
      _id,
      modifiedHrActivity,
      { new: true, session }
    );

    // Step 3: Log audit trail inside transaction
    await logAuditTrail({
      userId: req.user._id,
      action: "EDIT_HR_ACTIVITY",
      entityType: "hrActivity",
      oldData,
      newData: updatedHrActivity.toObject(),
      description: `${req.user.username} updated HR activity with title: ${updatedHrActivity.title}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Commit transaction for DB update and audit log
    await session.commitTransaction();
    session.endSession();

    // Step 4: Update cache (outside transaction)
    const cacheKey = `hrActivities`;
    const cachedActivities = (await getCachedData(cacheKey)) || [];

    const updatedActivities = cachedActivities.filter(
      (activity) => activity._id.toString() !== updatedHrActivity._id.toString()
    );
    updatedActivities.push(updatedHrActivity);
    await cacheResponse(cacheKey, updatedActivities);

    res.status(201).send({ message: "HR activity updated successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error editing HR activity:", error);
    res.status(500).send("Internal Server Error");
  }
};

export default editHrActivity;
