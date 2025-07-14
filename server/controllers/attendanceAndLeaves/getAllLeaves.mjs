import LeaveModel from "../../model/LeaveApplicationsModel.mjs";
import TeamModel from "../../model/teamModel.mjs";

const getAllLeaves = async (req, res) => {
  try {
    const scope = req.permissionScope;
    const { username } = req.user;

    // Get current date in YYYY-MM-DD format
    const currentDate = new Date().toISOString().split("T")[0];

    let allowedUsernames = [];

    if (scope === "self") {
      allowedUsernames = [username];
    } else if (scope === "team") {
      const teams = await TeamModel.find({ members: username }).select(
        "members"
      );
      const teamMembers = new Set();
      teams.forEach((team) =>
        team.members.forEach((member) => teamMembers.add(member))
      );
      allowedUsernames = Array.from(teamMembers);
    } // scope === 'all' => no filter on usernames

    // Build the query for future leaves only
    const matchQuery = {
      from: { $gte: currentDate }, // Only leaves that start after today
    };

    if (scope !== "all") {
      matchQuery.username = { $in: allowedUsernames };
    }

    const leaves = await LeaveModel.find(matchQuery).select(
      "username from to status reason medical_certificate leaveType days appliedOn approvedBy"
    );

    // Transform the data to match the expected response format
    const result = leaves.map((leave) => ({
      _id: leave._id,
      username: leave.username,
      from: leave.from,
      to: leave.to,
      status: leave.status,
      reason: leave.reason || "",
      medical_certificate: leave.medical_certificate || "",
      leaveType: leave.leaveType,
      days: leave.days,
      appliedOn: leave.appliedOn,
      approvedBy: leave.approvedBy,
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getAllLeaves:", error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export default getAllLeaves;
