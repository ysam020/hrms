import TeamModel from "../../model/teamModel.mjs";

const getTeams = async (req, res) => {
  try {
    const teams = await TeamModel.find({});
    res.status(200).send(teams);
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).send({
      message: "Failed to fetch teams",
      error: error.message,
    });
  }
};

export default getTeams;
