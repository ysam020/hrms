import RoleModel from "../../model/roleModel.mjs";

const getRoleAndPermissions = async (req, res) => {
  try {
    // Find the role by _id
    const roles = await RoleModel.find({}).select("name permissions");

    if (!roles) {
      return res.status(404).send({ message: "No roles found" });
    }

    res.status(200).send(roles);
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).send({
      message: error.message,
    });
  }
};

export default getRoleAndPermissions;
