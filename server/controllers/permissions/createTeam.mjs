import mongoose from "mongoose";
import TeamModel from "../../model/teamModel.mjs";
import logAuditTrail from "../../utils/auditLogger.mjs";
import sendPushNotifications from "../../utils/sendPushNotifications.mjs";

const createTeam = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { team_name, members } = req.body;

    if (!team_name) {
      return res.status(400).send({ message: "Team name is required" });
    }

    session.startTransaction();

    const existingTeam = await TeamModel.findOne({ team_name }).session(
      session
    );
    if (existingTeam) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .send({ message: "Team with this name already exists" });
    }

    const newTeam = new TeamModel({ team_name, members });
    await newTeam.save({ session });

    await logAuditTrail({
      userId: req.user._id,
      action: "CREATE_TEAM",
      entityType: "employeeManagement",
      newData: newTeam,
      description: `${req.user.username} created a team: ${newTeam.team_name}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await session.commitTransaction();
    session.endSession();

    for (const member of members) {
      await sendPushNotifications(
        member,
        "Team update",
        `You have been added to a new team: ${team_name}`
      );
    }

    res.status(201).send({ message: "Team created successfully" });
  } catch (error) {
    console.error(error);
    await session.abortTransaction();
    session.endSession();
    res.status(500).send("Internal Server Error");
  }
};

export default createTeam;
