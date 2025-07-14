import UserModel from "../../model/userModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";

const viewAllKycs = async (req, res) => {
  try {
    const scope = req.permissionScope;
    const username = req.user.username;

    // Handle "self" scope (no caching)
    if (scope === "self") {
      const user = await UserModel.findOne(
        { username },
        "first_name middle_name last_name username department designation employeeStatus kyc_approval"
      );

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.json([user]);
    }

    // Handle "all" scope with caching
    const cacheKey = "kyc_records";
    const cachedData = await getCachedData(cacheKey);

    if (cachedData) {
      return res.send(cachedData);
    }

    const users = await UserModel.find(
      {},
      "first_name middle_name last_name username department designation employeeStatus kyc_approval"
    ).sort({ username: 1 });

    await cacheResponse(cacheKey, users);

    res.send(users);
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message:
        "An error occurred while fetching KYC records. Please try again later.",
    });
  }
};

export default viewAllKycs;
