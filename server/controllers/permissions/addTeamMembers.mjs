import mongoose from "mongoose";
import TeamModel from "../../model/teamModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const addTeamMembers = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { _id, members = [] } = req.body;

    if (!_id) {
      return res.status(400).send({ message: "Team not found" });
    }

    session.startTransaction();

    const existingTeam = await TeamModel.findById(_id).session(session);

    if (!existingTeam) {
      await session.abortTransaction();
      return res.status(404).send({ message: "Team not found" });
    }

    const oldMembers = [...existingTeam.members];

    const updatedMembers = Array.from(
      new Set([...existingTeam.members, ...members])
    );

    existingTeam.members = updatedMembers;
    await existingTeam.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: "ADD_TEAM_MEMBERS",
      entityType: "employeeManagement",
      oldData: oldMembers,
      newData: members,
      description: `${req.user.username} added members to the team: ${existingTeam.team_name}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    for (const member of members) {
      await sendPushNotifications(
        member,
        "Team update",
        `You have been added to a new team: ${existingTeam.team_name}`
      );
    }

    res.status(200).send({
      message: "Team updated successfully",
      members: updatedMembers,
    });
  } catch (error) {
    console.error(error);
    await session.abortTransaction();
    session.endSession();
    res.status(500).send("Internal Server Error");
  }
};

export default addTeamMembers;
