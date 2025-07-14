import mongoose from "mongoose";
import JobOpeningModel from "../../model/jobOpeneningModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const editJobOpening = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { _id } = req.params;
    const modifiedJobOpening = req.body;

    // Step 1: Fetch and clone the original document within the session
    const existingJobOpening = await JobOpeningModel.findById(_id).session(
      session
    );
    if (!existingJobOpening) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send("Job opening not found");
    }

    const oldData = existingJobOpening.toObject(); // Clone for audit log

    // Step 2: Update the document within the session
    const updatedJobOpening = await JobOpeningModel.findByIdAndUpdate(
      _id,
      modifiedJobOpening,
      { new: true, session }
    );

    // Step 3: Log audit with old and new data
    await logAuditTrail({
      userId: req.user._id,
      action: "EDIT_JOB_OPENING",
      entityType: "jobOpening",
      oldData,
      newData: updatedJobOpening.toObject(),
      description: `${req.user.username} updated job opening titled "${updatedJobOpening.jobTitle}"`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(201).send({ message: "Job opening updated successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error editing job opening:", error);
    res.status(500).send("Internal Server Error");
  }
};

export default editJobOpening;
