import mongoose from "mongoose";
import TeamModel from "../../model/teamModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const deleteTeam = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { _id } = req.params;

    session.startTransaction();

    // Find and delete the team within the transaction session
    const deletedTeam = await TeamModel.findByIdAndDelete(_id).session(session);

    if (!deletedTeam) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "Team not found" });
    }

    await logAuditTrail({
      userId: req.user._id,
      action: "DELETE_TEAM",
      entityType: "employeeManagement",
      oldData: { team_name: deletedTeam.team_name },
      description: `${req.user.username} deleted a team: ${deletedTeam.team_name}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).send({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("Error deleting team:", error);
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .send({ message: "Internal Server Error", error: error.message });
  }
};

export default deleteTeam;
