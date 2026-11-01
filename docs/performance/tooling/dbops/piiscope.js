const { master, forDb, aggregateAll } = require("./common");
const shape = (v) =>
  typeof v !== "string"
    ? typeof v
    : v.startsWith("data:")
      ? "data-url"
      : v.startsWith("https://")
        ? "https:" +
          v
            .replace(/^https:\/\/[^/]+\//, "")
            .split("/")
            .map((p, i, a) =>
              i === a.length - 1 ? "<file>" : p.length > 20 ? "<id>" : p,
            )
            .join("/")
        : "other";
(async () => {
  const m = await master();
  const c = forDb("hrms-acme-corp");
  const apps = await aggregateAll(c, "jobapplications", [
    { $project: { aadharNo: 1, resume: 1, jobOpeningId: 1, tenantId: 1 } },
  ]);
  console.log(
    "apps",
    apps.length,
    JSON.stringify(
      apps.map((a) => ({
        aadhaar: typeof a.aadharNo === "string" && a.aadharNo.length > 0,
        resume: shape(a.resume),
        len: typeof a.resume === "string" ? a.resume.length : 0,
      })),
    ),
  );
  const RES = {
    $or: [
      {
        $gt: [
          {
            $strLenBytes: {
              $ifNull: [
                {
                  $cond: [
                    { $eq: [{ $type: "$oldValue.resume" }, "string"] },
                    "$oldValue.resume",
                    "",
                  ],
                },
                "",
              ],
            },
          },
          1024,
        ],
      },
      {
        $gt: [
          {
            $strLenBytes: {
              $ifNull: [
                {
                  $cond: [
                    { $eq: [{ $type: "$newValue.resume" }, "string"] },
                    "$newValue.resume",
                    "",
                  ],
                },
                "",
              ],
            },
          },
          1024,
        ],
      },
    ],
  };
  const AAD = {
    $or: [
      {
        $and: [
          { $eq: [{ $type: "$oldValue.aadharNo" }, "string"] },
          { $ne: ["$oldValue.aadharNo", "[REDACTED]"] },
          { $ne: ["$oldValue.aadharNo", ""] },
        ],
      },
      {
        $and: [
          { $eq: [{ $type: "$newValue.aadharNo" }, "string"] },
          { $ne: ["$newValue.aadharNo", "[REDACTED]"] },
          { $ne: ["$newValue.aadharNo", ""] },
        ],
      },
    ],
  };
  const r = await aggregateAll(c, "auditlogs", [
    { $match: { entityType: { $in: ["JobApplication", "ApplicationDraft"] } } },
    {
      $group: {
        _id: "$entityType",
        total: { $sum: 1 },
        aadhaar: { $sum: { $cond: [AAD, 1, 0] } },
        resume: { $sum: { $cond: [RES, 1, 0] } },
        draftData: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: [{ $type: "$oldValue.data" }, "object"] },
                  { $eq: [{ $type: "$newValue.data" }, "object"] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  console.log("audit", JSON.stringify(r));
  await c.$disconnect();
  await m.$disconnect();
})().catch((e) => {
  console.error(
    "ERR",
    e.message.replace(/mongodb(\+srv)?:\/\/[^\s"]+/g, "<uri>"),
  );
  process.exit(1);
});
