const { execFileSync } = require("child_process");
const { master, forDb, aggregateAll } = require("./common");
const scrub = (s) =>
  String(s)
    .replace(/mongodb(\+srv)?:\/\/[^\s"]+/g, "<uri>")
    .replace(/at "[^"]+"/g, 'at "<host>"');
async function indexSet(c) {
  const colls = (
    await c.$runCommandRaw({ listCollections: 1, nameOnly: true })
  ).cursor.firstBatch.map((x) => x.name);
  const set = new Set();
  for (const coll of colls) {
    const r = await c.$runCommandRaw({ listIndexes: coll });
    for (const i of r.cursor.firstBatch)
      if (i.name !== "_id_") set.add(`${coll}.${i.name}`);
  }
  return set;
}
(async () => {
  const m = await master();
  const base = process.env.DEV_MONGODB_URI;
  const tenants = await aggregateAll(m, "tenants", [
    { $match: { dbName: { $ne: null } } },
    { $project: { dbName: 1 } },
  ]);
  let failed = 0;
  for (const { dbName } of tenants) {
    const c = forDb(dbName);
    const before = await indexSet(c);
    let ok = true,
      tail = "";
    try {
      const out = execFileSync(
        "node_modules/.bin/prisma",
        [
          "db",
          "push",
          "--skip-generate",
          "--schema",
          "/tmp/probe/schema.prisma",
        ],
        {
          env: {
            ...process.env,
            DEV_MONGODB_URI: base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      tail =
        scrub(out)
          .split("\n")
          .filter((l) => /\[\+\]|\[-\]|sync|Error/.test(l)).length +
        " change lines";
    } catch (e) {
      ok = false;
      failed++;
      tail = scrub((e.stdout || "") + (e.stderr || ""))
        .split("\n")
        .filter((l) => /Error|E11000|failed/i.test(l))
        .slice(0, 3)
        .join(" | ");
    }
    const after = await indexSet(c);
    const dropped = [...before].filter((x) => !after.has(x));
    const added = [...after].filter((x) => !before.has(x));
    console.log(
      JSON.stringify({
        dbName,
        ok,
        before: before.size,
        after: after.size,
        added: added.length,
        dropped,
        note: tail,
      }),
    );
    await c.$disconnect();
  }
  await m.$disconnect();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("ERR", scrub(e.message));
  process.exit(1);
});
