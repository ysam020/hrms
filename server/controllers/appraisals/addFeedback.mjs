import mongoose from "mongoose";
import AppraisalModel from "../../model/appraisalModel.mjs";
import TeamModel from "../../model/teamModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const addFeedback = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const scope = req.permissionScope;
    const { _id, username } = req.params;
    const { manager_strengths, manager_AreasOfImprovement, feedback } =
      req.body;

    // Restrict feedback to own appraisal for self scope
    if (scope === "self") {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).send({
        message: "You cannot give feedback to your own appraisal.",
      });
    }

    // Restrict feedback if username matches current user (regardless of scope)
    if (username === req.user.username) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).send({
        message: "You cannot give feedback to your own appraisal.",
      });
    }

    if (scope === "team") {
      // Find all teams current user is part of
      const teams = await TeamModel.find({
        members: req.user.username,
      }).session(session);

      const isInSameTeam = teams.some((team) =>
        team.members.includes(username)
      );

      if (!isInSameTeam) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).send({
          message: "Access denied: the user is not in your team.",
        });
      }
    }

    // Find the document by username with session
    const doc = await AppraisalModel.findOne({ username }).session(session);
    if (!doc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "User not found" });
    }

    // Find the appraisal subdocument by _id
    const appraisalToUpdate = doc.appraisals.id(_id);
    if (!appraisalToUpdate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "Appraisal not found" });
    }

    // Store old data for audit
    const oldData = { ...appraisalToUpdate.toObject() };

    // Update the feedback fields
    appraisalToUpdate.manager_strengths = manager_strengths;
    appraisalToUpdate.manager_AreasOfImprovement = manager_AreasOfImprovement;
    appraisalToUpdate.feedback = feedback;

    // Save the updated document with session
    await doc.save({ session });

    // Log audit trail
    await logAuditTrail({
      userId: req.user._id,
      action: "ADD_APPRAISAL_FEEDBACK",
      entityType: "appraisal",
      oldData,
      newData: appraisalToUpdate.toObject(),
      description: `${req.user.username} added feedback to an appraisal for ${username}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    await sendPushNotifications(
      username,
      "Appraisal Feedback",
      `${req.user.username} added feedback to your appraisal`
    );

    res.status(200).send({ message: "Feedback added successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Add appraisal feedback error:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default addFeedback;
