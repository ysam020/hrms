import UserModel from "../../model/userModel.mjs";

const getJoiningData = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); // 0-indexed for the month
    const oneYearAgo = new Date(currentDate);
    oneYearAgo.setFullYear(currentYear - 1); // Set date to one year ago

    // Aggregate query
    const rawResult = await UserModel.aggregate([
      {
        $addFields: {
          // Parse the 'joining_date' string to a Date object for proper comparison
          parsedJoiningDate: {
            $dateFromString: { dateString: "$joining_date" },
          },
        },
      },
      {
        $match: {
          // Match records that joined within the last year
          parsedJoiningDate: {
            $gte: oneYearAgo,
            $lt: currentDate, // Ensure less than the current date
          },
        },
      },
      {
        $project: {
          // Extract year and month from parsedJoiningDate
          year: { $year: "$parsedJoiningDate" },
          month: { $month: "$parsedJoiningDate" },
        },
      },
      {
        $group: {
          // Group by year and month
          _id: { year: "$year", month: "$month" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          year: "$_id.year",
          month: "$_id.month",
          count: 1,
          _id: 0,
        },
      },
    ]);

    // Months array for formatting
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Format the result
    const formattedResult = rawResult.map((data) => ({
      count: data.count,
      formattedDate: `${months[data.month - 1]} ${data.year}`,
      year: data.year,
      month: data.month,
    }));

    // Generate an array for the last 12 months
    const rearrangedResult = [];
    for (let i = 1; i <= 12; i++) {
      const targetMonth = (currentMonth - i + 12) % 12 || 12; // Wrap months correctly
      const targetYear = currentMonth - i < 0 ? currentYear - 1 : currentYear;

      const matchedData = formattedResult.find(
        (data) => data.month === targetMonth && data.year === targetYear
      );

      // If no data for the month, add with count as 0
      if (matchedData) {
        rearrangedResult.unshift(matchedData);
      } else {
        rearrangedResult.unshift({
          count: 0,
          formattedDate: `${months[targetMonth - 1]} ${targetYear}`,
        });
      }
    }

    const updatedData = formattedResult.map((item) => {
      if (!item.year || !item.month) {
        const [month, year] = item.formattedDate.split(" ").reverse();
        item.year = parseInt(year);
        item.month = new Date(`${month} 1, 2024`).getMonth() + 1; // Get month index (1 - 12)
      }
      return item;
    });

    // Create an array for all months in the required range (Jan 2024 to Dec 2024)
    const fullYearData = [];
    for (let month = 1; month <= 12; month++) {
      const existingEntry = updatedData.find(
        (entry) => entry.month === month && entry.year === 2024
      );
      fullYearData.push({
        count: existingEntry ? existingEntry.count : 0,
        formattedDate: `${new Date(2024, month - 1).toLocaleString("default", {
          month: "short",
        })} 2024`,
        year: 2024,
        month,
      });
    }

    // Sort the final list by month in chronological order (which will already be in this order)
    const sortedData = fullYearData.sort((a, b) => {
      if (a.year === b.year) {
        return a.month - b.month;
      }
      return a.year - b.year;
    });

    res.status(200).json(sortedData);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

export default getJoiningData;
