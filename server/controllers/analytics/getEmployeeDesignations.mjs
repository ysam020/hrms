import UserModel from "../../model/userModel.mjs";

const getEmployeeDesignations = async (req, res) => {
  try {
    const departmentCounts = await UserModel.aggregate([
      {
        $match: {
          designation: { $exists: true, $nin: [null, ""] },
        },
      },
      {
        $group: {
          _id: "$designation", // Group by designation
          count: { $sum: 1 }, // Count users
        },
      },
    ]);

    res.status(200).json(departmentCounts);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default getEmployeeDesignations;
