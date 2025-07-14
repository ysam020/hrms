import mongoose from "mongoose";
import JobOpeningModel from "../../model/jobOpeneningModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const deleteJobOpening = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { _id } = req.params;

    // Delete the job opening document within the session
    const deletedJobOpening = await JobOpeningModel.findByIdAndDelete(_id, {
      session,
    });
    if (!deletedJobOpening) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send("Job opening not found");
    }

    // Log audit trail within the same transaction/session
    await logAuditTrail({
      userId: req.user._id,
      action: "DELETE_JOB_OPENING",
      entityType: "jobOpening",
      oldData: deletedJobOpening.toObject(),
      description: `${req.user.username} deleted job opening with title: ${deletedJobOpening.jobTitle}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(201).send({ message: "Job opening deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting job opening:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default deleteJobOpening;
