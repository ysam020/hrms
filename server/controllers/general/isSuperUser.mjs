import UserModel from "../../model/userModel.mjs";

const isSuperUser = async (req, res) => {
  try {
    const { username } = req.params;

    // Find the user by username
    const user = await UserModel.findOne({ username });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // Check if the user is a super user
    if (user.isSuperUser) {
      return res.status(200).send({ isSuperUser: true });
    } else {
      return res.status(200).send({ isSuperUser: false });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export default isSuperUser;
