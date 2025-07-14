import getAttendanceSummary from "../../utils/getAttendanceSummary.mjs";

const getSummary = async (req, res) => {
  try {
    const { username, year, month } = req.params;

    const result = await getAttendanceSummary(
      username,
      parseInt(year),
      parseInt(month)
    );
    res.status(200).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
};

export default getSummary;
