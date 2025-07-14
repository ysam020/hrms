import RoleModel from "../../model/roleModel.mjs";
import { sanitizeData } from "../../utils/sanitizer.mjs";

const getRolePermissions = async (req, res) => {
  try {
    const { _id } = req.params;

    // Validate the _id format (check if it’s a valid ObjectId)
    if (!_id || !/^[0-9a-fA-F]{24}$/.test(_id)) {
      return res.status(400).send({ message: "Invalid role ID format" });
    }

    // Find the role by _id and only select the permissions field
    const role = await RoleModel.findById(_id).select("permissions");

    if (!role) {
      return res.status(404).send({ message: "Role not found" });
    }

    // Sanitize the permissions data before sending it
    const sanitizedPermissions = sanitizeData(role.permissions);

    // Send the sanitized permissions
    res.status(200).json(sanitizedPermissions);
  } catch (error) {
    console.error("Error fetching role permissions:", error);
    res.status(500).send({
      message: error.message || "Internal Server Error",
    });
  }
};

export default getRolePermissions;
