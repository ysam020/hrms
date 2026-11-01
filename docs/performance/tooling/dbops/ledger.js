const { master, forDb, aggregateAll, oidRange } = require("./common");
const WIN = ["2026-07-09T15:30:00Z", "2026-07-09T16:40:00Z"];
const SIG_LEAVE = {
  $and: [
    { $eq: ["$status", "Approved"] },
    { $eq: ["$days", 1] },
    { $eq: ["$from", "$to"] },
    { $eq: ["$appliedOn", "$from"] },
    { $eq: ["$approvedOn", "$from"] },
  ],
};
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
const IST = 330 * 60 * 1000;
const oid = (x) => (x && x.$oid) || String(x);
const dt = (x) => new Date(x && x.$date ? x.$date : x);
async function planLedger(c, db) {
  const seedLeaves = await aggregateAll(c, "leaves", [
    { $match: { $and: [oidRange(...WIN), { $expr: SIG_LEAVE }] } },
    { $project: { userId: 1, from: 1, leaveType: 1 } },
  ]);
  const seedUsers = new Set(
    (
      await aggregateAll(c, "attendance_records", [
        { $match: { $and: [oidRange(...WIN), { $expr: SIG_ATT }] } },
        { $group: { _id: "$userId" } },
      ])
    ).map((x) => oid(x._id)),
  );
  seedLeaves.forEach((l) => seedUsers.add(oid(l.userId)));
  const plByUserMonth = {};
  for (const l of seedLeaves) {
    if (l.leaveType !== "PL") continue;
    const d = new Date(dt(l.from).getTime() + IST);
    const k = `${oid(l.userId)}|${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    plByUserMonth[k] = (plByUserMonth[k] || 0) + 1;
  }
  const rows = await aggregateAll(c, "leavebalances", [
    {
      $project: {
        userId: 1,
        balances: 1,
        accumulatedPLBeforeCurrentMonth: 1,
        createdBySeed: oidRange(...WIN).$expr,
      },
    },
  ]);
  const firstRowOf = {};
  for (const r of rows) {
    const u = oid(r.userId);
    const id = oid(r._id);
    if (!firstRowOf[u] || id < firstRowOf[u]) firstRowOf[u] = id;
  }
  const plan = [];
  const stat = {
    seedEmployees: seedUsers.size,
    rows: rows.length,
    rowsOfSeedEmployees: 0,
    seedCreatedRows: 0,
    shape: {},
    entriesMatched: 0,
    entriesMismatched: 0,
    rowsToRepair: 0,
    accDecrease: 0,
    negativeClamped: 0,
    hybridRepaired: 0,
  };
  for (const r of rows) {
    const u = oid(r.userId);
    const isArr = Array.isArray(r.balances);
    const isHybrid =
      !isArr &&
      r.balances &&
      typeof r.balances === "object" &&
      Object.keys(r.balances).some((k) => /^\d+$/.test(k));
    const shape = isArr
      ? "array"
      : isHybrid
        ? "hybrid"
        : r.balances && typeof r.balances === "object"
          ? "object"
          : "other";
    stat.shape[shape] = (stat.shape[shape] || 0) + 1;
    if (!seedUsers.has(u) && shape !== "hybrid") continue;
    if (seedUsers.has(u)) stat.rowsOfSeedEmployees++;
    if (r.createdBySeed) stat.seedCreatedRows++;
    if (r.createdBySeed && firstRowOf[u] !== oid(r._id)) {
      stat.dupRowsDeleted = (stat.dupRowsDeleted || 0) + 1;
      plan.push({
        id: oid(r._id),
        action: "delete-row",
        reason: "duplicate balance row created by the seed run",
      });
      continue;
    }
    let entries = isArr
      ? r.balances
      : isHybrid
        ? Object.keys(r.balances)
            .filter((k) => /^\d+$/.test(k))
            .sort((a, b) => a - b)
            .map((k) => r.balances[k])
        : null;
    if (!entries) continue;
    const keep = [];
    let dec = 0;
    let removed = 0;
    for (const e of entries) {
      const seedMonth = e && e.year === 2026 && [5, 6, 7].includes(e.month);
      const expectedUsed = plByUserMonth[`${u}|${e?.year}-${e?.month}`] || 0;
      if (
        seedUsers.has(u) &&
        seedMonth &&
        e.earnedPL === 1 &&
        e.usedLWP === 0 &&
        e.usedPL === expectedUsed
      ) {
        stat.entriesMatched++;
        removed++;
        if ((e.remainingPL ?? 0) === 0) dec += Math.max(0, 1 - expectedUsed); // already carried forward into the accumulator
      } else {
        if (seedUsers.has(u) && seedMonth) stat.entriesMismatched++;
        keep.push(e);
      }
    }
    if (removed || isHybrid) {
      const acc = r.accumulatedPLBeforeCurrentMonth ?? 0;
      let next = acc - dec;
      if (next < 0) {
        stat.negativeClamped++;
        next = 0;
      }
      stat.rowsToRepair++;
      stat.accDecrease += dec;
      if (isHybrid) stat.hybridRepaired++;
      plan.push({
        id: oid(r._id),
        action: "repair-ledger",
        balances: keep,
        accumulatedPLBeforeCurrentMonth: next,
        wasHybrid: isHybrid,
        removedEntries: removed,
        accDecrease: dec,
      });
    }
  }
  return { stat, plan };
}
module.exports = { planLedger, WIN, SIG_ATT, SIG_LEAVE };
if (require.main === module)
  (async () => {
    const m = await master();
    for (const db of ["hrms-acme-corp", "hrms-appinventiv", "hrms-praesto"]) {
      const c = forDb(db);
      const { stat } = await planLedger(c, db);
      console.log(db, JSON.stringify(stat));
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
