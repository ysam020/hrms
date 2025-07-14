import AppraisalModel from "../../model/appraisalModel.mjs";
import TeamModel from "../../model/teamModel.mjs";
import { sanitizeData } from "../../utils/sanitizer.mjs";

const viewAppraisals = async (req, res) => {
  try {
    const scope = req.permissionScope;
    const currentUsername = req.user.username;

    let filter = {};

    if (scope === "self") {
      // Only fetch appraisals for the current user
      filter = { username: currentUsername };
    } else if (scope === "team") {
      const teams = await TeamModel.find({ members: currentUsername }).lean();

      const teamUsernames = new Set();
      teams.forEach((team) => {
        team.members.forEach((member) => {
          teamUsernames.add(member);
        });
      });

      // Include current user
      teamUsernames.add(currentUsername);

      if (teamUsernames.size === 0) {
        return res.status(403).json({ message: "No team members found." });
      }

      filter = { username: { $in: Array.from(teamUsernames) } };
    }
    // else scope === "all" => no filter needed, will fetch everything

    const allDocs = await AppraisalModel.find(filter).lean();

    const flattenedMemos = allDocs.flatMap((doc) =>
      doc.appraisals.map((appraisal) => ({
        username: doc.username,
        _id: appraisal._id?.toString?.(),
        appraisalDate: appraisal.appraisalDate,
        score: appraisal.score,
        strengths: appraisal.strengths,
        areasOfImprovement: appraisal.areasOfImprovement,
        manager_strengths: appraisal.manager_strengths,
        manager_AreasOfImprovement: appraisal.manager_AreasOfImprovement,
        feedback: appraisal.feedback,
      }))
    );

    if (!flattenedMemos.length) {
      return res.status(404).send("No appraisals found");
    }

    const sanitized = sanitizeData(flattenedMemos);
    res.status(200).json(sanitized);
  } catch (error) {
    console.error("View appraisals error:", error);
    res.status(500).send("Internal Server Error");
  }
};

export default viewAppraisals;
