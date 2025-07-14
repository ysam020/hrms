import RoleModel from "../../model/roleModel.mjs";

const getRoles = async (req, res) => {
  try {
    const roles = await RoleModel.find({}).select("name assignedTo");
    res.status(200).send(roles);
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).send({
      message: "Failed to fetch roles",
      error: error.message,
    });
  }
};

export default getRoles;
