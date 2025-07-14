import salaryStructureModel from "../../model/salaryStructureModel.mjs";

const getUserSalary = async (req, res) => {
  try {
    const { username, month, year } = req.params;
    const salary = await salaryStructureModel.findOne({
      username,
      month: parseInt(month),
      year: parseInt(year),
    });
    res.status(200).send(salary.salaryStructure);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
};

export default getUserSalary;
