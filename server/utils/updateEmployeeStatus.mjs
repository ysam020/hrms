import UserModel from "../model/userModel.mjs";
import ResignationModel from "../model/resignationModel.mjs";
import moment from "moment";

const updateEmployeeStatus = async () => {
  try {
    // Get yesterday's date in 'YYYY-MM-DD' format
    const yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");

    // Find resignations where last_date is yesterday
    const resignations = await ResignationModel.find({ last_date: yesterday });

    if (resignations.length === 0) {
      return;
    }

    for (const resignation of resignations) {
      const username = resignation.username;

      await UserModel.findOneAndUpdate(
        { username },
        { employeeStatus: "Resigned" },
        { new: true }
      );
    }
  } catch (error) {
    console.error("Error updating employee statuses:", error);
  }
};

export default updateEmployeeStatus;
