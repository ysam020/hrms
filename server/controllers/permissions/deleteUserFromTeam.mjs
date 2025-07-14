import mongoose from "mongoose";
import TeamModel from "../../model/teamModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";

const deleteUserFromTeam = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { username, teamId } = req.body;

    session.startTransaction();

    // Step 1: Find the team inside the transaction session
    const team = await TeamModel.findById(teamId).session(session);
    if (!team) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ message: "Team not found" });
    }

    // Step 2: Store old members
    const oldMembers = [...team.members];

    // Step 3: Remove the user from the array (in-memory)
    const newMembers = oldMembers.filter((member) => member !== username);

    // Step 4: Update the team in DB within the session
    team.members = newMembers;
    await team.save({ session });

    // Step 5: Log the action
    await logAuditTrail({
      userId: req.user._id,
      action: "REMOVE_TEAM_MEMBER",
      entityType: "employeeManagement",
      oldData: oldMembers,
      newData: newMembers,
      description: `${req.user.username} removed ${username} from the team: ${team.team_name}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).send({ message: "User removed from team" });
  } catch (error) {
    console.error("Error removing user from team:", error);
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .send({ message: "Internal Server Error", error: error.message });
  }
};

export default deleteUserFromTeam;
