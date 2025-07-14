import UserModel from "../../model/userModel.mjs";

const getUserPermissions = async (req, res) => {
  const { username } = req.params;
  try {
    const user = await UserModel.findOne({ username }).select("permissions");
    res.status(200).send(user.permissions);
  } catch (error) {
    console.error("Error fetching permissions:", error);
    res.status(500).send({
      message: "Failed to fetch permissions",
      error: error.message,
    });
  }
};

export default getUserPermissions;
