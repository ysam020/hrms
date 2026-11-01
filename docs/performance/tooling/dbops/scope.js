const { master, forDb, aggregateAll, oidRange } = require("./common");
// Seed signature (seedRunner.ts @ a34c87e): attendance has workingHours 8, timeOut set,
// status Present/Late/WFH, date strictly before the run day (2026-07-09 IST), created that evening.
const WIN = ["2026-07-09T15:30:00Z", "2026-07-09T16:40:00Z"];
const SIG_ATT = {
  $and: [
    { $eq: ["$workingHours", 8] },
    { $ne: [{ $ifNull: ["$timeOut", null] }, null] },
    { $in: ["$status", ["Present", "Late", "WFH"]] },
    {
      $lt: [
        "$date",
        { $dateFromString: { dateString: "2026-07-08T18:30:00Z" } },
      ],
    },
  ],
};
// Seed leaves: approved, single day, appliedOn == approvedOn == from == to, days 1.
const SIG_LEAVE = {
  $and: [
    { $eq: ["$status", "Approved"] },
    { $eq: ["$days", 1] },
    { $eq: ["$from", "$to"] },
    { $eq: ["$appliedOn", "$from"] },
    { $eq: ["$approvedOn", "$from"] },
  ],
};
(async () => {
  const m = await master();
  for (const db of ["hrms-acme-corp", "hrms-appinventiv"]) {
    const c = forDb(db);
    const att = await aggregateAll(c, "attendance_records", [
      { $match: oidRange(...WIN) },
      {
        $group: {
          _id: {
            min: {
              $dateToString: { date: { $toDate: "$_id" }, format: "%H:%M" },
            },
            sig: SIG_ATT,
          },
          n: { $sum: 1 },
          users: { $addToSet: "$userId" },
        },
      },
      { $project: { n: 1, users: { $size: "$users" } } },
      { $sort: { "_id.min": 1 } },
    ]);
    const lv = await aggregateAll(c, "leaves", [
      { $match: oidRange(...WIN) },
      { $group: { _id: { sig: SIG_LEAVE }, n: { $sum: 1 } } },
    ]);
    const attTot = await aggregateAll(c, "attendance_records", [
      { $match: oidRange(...WIN) },
      {
        $group: {
          _id: SIG_ATT,
          n: { $sum: 1 },
          users: { $addToSet: "$userId" },
          minD: { $min: "$date" },
          maxD: { $max: "$date" },
        },
      },
      { $project: { n: 1, users: { $size: "$users" }, minD: 1, maxD: 1 } },
    ]);
    // duplicates remaining if we removed the signature-matching window records:
    const dupAfter = await aggregateAll(c, "attendance_records", [
      {
        $match: {
          $expr: {
            $not: [
              {
                $and: [
                  {
                    $gte: [
                      { $toDate: "$_id" },
                      { $dateFromString: { dateString: WIN[0] } },
                    ],
                  },
                  {
                    $lte: [
                      { $toDate: "$_id" },
                      { $dateFromString: { dateString: WIN[1] } },
                    ],
                  },
                  SIG_ATT,
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: { t: "$tenantId", u: "$userId", d: "$date" },
          n: { $sum: 1 },
        },
      },
      { $match: { n: { $gt: 1 } } },
      { $count: "dupGroupsAfter" },
    ]);
    console.log(
      JSON.stringify({
        db,
        attendanceByMinute: att.map((x) => [
          x._id.min,
          x._id.sig,
          x.n,
          x.users,
        ]),
        attendanceSignature: attTot,
        leavesSignature: lv,
        dupGroupsRemainingAfterRemoval: dupAfter[0]?.dupGroupsAfter ?? 0,
      }),
    );
    await c.$disconnect();
  }
  await m.$disconnect();
})().catch((e) => {
  console.error(
    "ERR",
    e.message.replace(/mongodb(\+srv)?:\/\/[^\s"]+/g, "<uri>"),
  );
  process.exit(1);
});
