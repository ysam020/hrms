import UserModel from "../../model/userModel.mjs";

const getEmployeeDepartments = async (req, res) => {
  try {
    const departmentCounts = await UserModel.aggregate([
      {
        $match: {
          department: { $exists: true, $nin: [null, ""] },
        },
      },
      {
        $project: {
          department: 1,
        },
      },
      {
        $group: {
          _id: "$department",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json(departmentCounts);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default getEmployeeDepartments;
