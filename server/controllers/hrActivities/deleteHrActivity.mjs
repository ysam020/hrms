import mongoose from "mongoose";
import hrActivityModel from "../../model/hrActivityModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const deleteHrActivity = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { _id } = req.params;

    // Step 1: Delete inside transaction
    const deletedHrActivity = await hrActivityModel
      .findByIdAndDelete(_id)
      .session(session);
    if (!deletedHrActivity) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send("HR activity not found");
    }

    // Step 2: Log audit trail inside transaction
    await logAuditTrail({
      userId: req.user._id,
      action: "DELETE_HR_ACTIVITY",
      entityType: "hrActivity",
      oldData: deletedHrActivity,
      description: `${req.user.username} deleted HR activity with title: ${deletedHrActivity.title}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Commit transaction for DB delete and audit log
    await session.commitTransaction();
    session.endSession();

    // Step 3: Update cache outside transaction
    const cacheKey = `hrActivities`;
    const cachedActivities = (await getCachedData(cacheKey)) || [];

    const updatedActivities = cachedActivities.filter(
      (activity) => activity._id.toString() !== deletedHrActivity._id.toString()
    );
    await cacheResponse(cacheKey, updatedActivities);

    res.status(201).send({ message: "HR activity deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting HR activity:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default deleteHrActivity;
