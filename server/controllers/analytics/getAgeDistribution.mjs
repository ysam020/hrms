import UserModel from "../../model/userModel.mjs";

const getAgeDistribution = async (req, res) => {
  try {
    const ageDistribution = await UserModel.aggregate([
      {
        $match: {
          dob: { $exists: true, $nin: [null, ""] },
        },
      },
      {
        $project: {
          age: {
            $floor: {
              $divide: [
                {
                  $subtract: [
                    new Date(),
                    { $dateFromString: { dateString: "$dob" } },
                  ],
                },
                365.25 * 24 * 60 * 60 * 1000,
              ],
            },
          },
        },
      },
      {
        $project: {
          ageGroup: {
            $concat: [
              {
                $toString: {
                  $subtract: [
                    {
                      $subtract: [
                        { $add: ["$age", 4] },
                        { $mod: [{ $add: ["$age", 4] }, 5] },
                      ],
                    },
                    4,
                  ],
                },
              },
              "-",
              {
                $toString: {
                  $subtract: [
                    { $add: ["$age", 4] },
                    { $mod: [{ $add: ["$age", 4] }, 5] },
                  ],
                },
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$ageGroup",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    res.status(200).json(ageDistribution);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default getAgeDistribution;
