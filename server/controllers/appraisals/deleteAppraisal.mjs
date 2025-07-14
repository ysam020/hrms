import mongoose from "mongoose";
import AppraisalModel from "../../model/appraisalModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const deleteAppraisal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { _id, username } = req.params;

    if (username !== req.user.username && !req.user.isSuperUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).send({
        message: "You are not authorized to delete this user's appraisal.",
      });
    }

    // Step 1: Find the document by username with session
    const doc = await AppraisalModel.findOne({ username }).session(session);
    if (!doc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "User not found" });
    }

    // Step 2: Find the appraisal by _id inside appraisals array
    const appraisalToDelete = doc.appraisals.id(_id);
    if (!appraisalToDelete) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "Appraisal not found" });
    }

    // Step 3: Remove the appraisal from the array in-memory
    appraisalToDelete.remove();

    // Step 4: Save the updated document with session
    await doc.save({ session });

    // Step 5: Log audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "DELETE_APPRAISAL",
      entityType: "appraisal",
      oldData: appraisalToDelete.toObject(),
      description: `${req.user.username} deleted an appraisal`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    // Step 6: Send response
    res.status(200).send({ message: "Appraisal deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("deleteAppraisal error:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default deleteAppraisal;
