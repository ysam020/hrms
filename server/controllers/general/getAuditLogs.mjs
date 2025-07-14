import AuditModel from "../../model/auditModel.mjs";
import UserModel from "../../model/userModel.mjs";
import TeamModel from "../../model/teamModel.mjs";

const getAuditLogs = async (req, res) => {
  try {
    const scope = req.permissionScope;
    const { days = 1, entityType = "", userName = "" } = req.query;

    const now = new Date();
    const pastDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const filter = {
      timestamp: { $gte: pastDate },
    };

    if (entityType) {
      filter.entityType = entityType;
    }

    const currentUser = req.user.username;

    if (scope === "self") {
      // Self scope: own logs only
      if (!userName || userName === currentUser) {
        filter.user = req.user._id;
      } else {
        return res.status(403).json({
          message: "You can only view your own audit logs.",
        });
      }
    } else if (scope === "team") {
      if (!userName) {
        // Get all teams of the current user
        const teams = await TeamModel.find({ members: currentUser });

        if (!teams.length) {
          return res.status(403).json({ message: "No teams found." });
        }

        // Collect all unique usernames from all teams
        const teamUsernamesSet = new Set();
        teams.forEach((team) => {
          team.members.forEach((member) => teamUsernamesSet.add(member));
        });

        const teamUsernames = Array.from(teamUsernamesSet);

        const teamMembers = await UserModel.find({
          username: { $in: teamUsernames },
        }).select("_id");

        filter.user = { $in: teamMembers.map((u) => u._id) };
      } else {
        // Check if requested username is in any team of current user
        if (userName === currentUser) {
          return res.status(403).json({
            message: "Use 'self' scope to view your own logs.",
          });
        }

        const teams = await TeamModel.find({ members: currentUser });

        const isInTeam = teams.some((team) => team.members.includes(userName));

        if (!isInTeam) {
          return res.status(403).json({
            message: "You can only view logs of users in your team.",
          });
        }

        const user = await UserModel.findOne({ username: userName }).select(
          "_id"
        );

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        filter.user = user._id;
      }
    } else if (scope === "all") {
      if (userName) {
        const user = await UserModel.findOne({ username: userName }).select(
          "_id"
        );
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        filter.user = user._id;
      }
      // If no userName, fetch all logs (no user filter)
    }

    const auditLogs = await AuditModel.find(filter)
      .populate("user", "name username email")
      .sort({ timestamp: -1 });

    if (!auditLogs.length) {
      return res.status(404).send({ message: "No audit logs found" });
    }

    res.status(200).send(auditLogs);
  } catch (error) {
    console.error("Error in getAuditLogs:", error);
    res.status(500).send({
      message:
        "An error occurred while fetching audit logs. Please try again later.",
    });
  }
};

export default getAuditLogs;
