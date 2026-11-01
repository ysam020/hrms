const { master, forDb, aggregateAll } = require("./common");
const U = require("./uniques.json");
(async () => {
  const m = await master();
  const tenants = await aggregateAll(m, "tenants", [
    { $match: { dbName: { $ne: null } } },
    { $project: { dbName: 1 } },
  ]);
  for (const { dbName } of tenants) {
    const c = forDb(dbName);
    const colls = new Set(
      (
        await c.$runCommandRaw({ listCollections: 1, nameOnly: true })
      ).cursor.firstBatch.map((x) => x.name),
    );
    const bad = [];
    for (const [coll, fields] of U) {
      if (!colls.has(coll)) continue;
      const id = Object.fromEntries(
        fields.map((f) => [
          f.replace(/\./g, "_"),
          { $ifNull: ["$" + f, null] },
        ]),
      );
      const r = await aggregateAll(c, coll, [
        { $group: { _id: id, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        {
          $group: {
            _id: null,
            groups: { $sum: 1 },
            extra: { $sum: { $subtract: ["$n", 1] } },
          },
        },
      ]);
      if (r.length)
        bad.push(
          `${coll}[${fields}] groups=${r[0].groups} extra=${r[0].extra}`,
        );
    }
    console.log(
      dbName,
      bad.length ? bad.join("; ") : "no duplicate unique keys",
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
