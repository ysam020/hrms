import UserModel from "../../model/userModel.mjs";

const getDetails = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await UserModel.findOne({ username }).select(
      "isSuperUser assets salaryStructure employeeStatus reasonForTermination dateOfTermination dateOfAbscond"
    );
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    res.status(200).send(user);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default getDetails;
