import salaryStructureModel from "../../model/salaryStructureModel.mjs";

const updateSalary = async (req, res) => {
  try {
    const { username, salaryStructure, month, year } = req.body;
    const monthNumber = parseInt(month);
    const yearNumber = parseInt(year);

    const updatedSalaryStructure = await salaryStructureModel.findOneAndUpdate(
      { username, month: monthNumber, year: yearNumber },
      { $set: { salaryStructure } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: "Salary updated successfully",
      data: updatedSalaryStructure,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update salary" });
  }
};

export default updateSalary;
