import UserModel from "../../model/userModel.mjs";

const getInterviewerList = async (req, res, next) => {
  try {
    const users = await UserModel.find({
      $or: [
        { permissions: "JobOpenings:take_interview" },
        { isSuperUser: true },
      ],
    }).select("-_id username");

    const userList = users.map((user) => user.username);

    res.status(200).json(userList);
  } catch (err) {
    next(err);
  }
};

export default getInterviewerList;
