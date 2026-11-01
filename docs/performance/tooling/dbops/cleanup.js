// node dbops/cleanup.js backup|apply   — writes under /tmp/praesto-cleanup (container).
const fs = require("fs");
const crypto = require("crypto");
const { master, forDb, aggregateAll, oidRange } = require("./common");
const { planLedger, WIN, SIG_ATT, SIG_LEAVE } = require("./ledger");
const DIR = "/tmp/praesto-cleanup";
const DBS = ["hrms-acme-corp", "hrms-appinventiv"];
const oid = (x) => (x && x.$oid) || String(x);
const sel = (sig) => [{ $match: { $and: [oidRange(...WIN), { $expr: sig }] } }];
async function computePlan(c, db) {
  const att = await aggregateAll(c, "attendance_records", sel(SIG_ATT));
  const lv = await aggregateAll(c, "leaves", sel(SIG_LEAVE));
  const { plan, stat } = await planLedger(c, db);
  const lbIds = plan.map((p) => p.id);
  const lb = lbIds.length
    ? await aggregateAll(c, "leavebalances", [
        { $match: { $expr: { $in: [{ $toString: "$_id" }, lbIds] } } },
      ])
    : [];
  return { att, lv, lb, plan, stat };
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const idsKey = (p) =>
  sha(
    JSON.stringify({
      att: p.att.map((x) => oid(x._id)).sort(),
      lv: p.lv.map((x) => oid(x._id)).sort(),
      plan: p.plan,
    }),
  );
(async () => {
  const mode = process.argv[2];
  const m = await master();
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const summary = {};
  for (const db of DBS) {
    const c = forDb(db);
    const p = await computePlan(c, db);
    const key = idsKey(p);
    if (mode === "backup") {
      for (const [name, docs] of [
        ["attendance_records", p.att],
        ["leaves", p.lv],
        ["leavebalances", p.lb],
      ]) {
        const body = JSON.stringify(docs);
        fs.writeFileSync(`${DIR}/${db}.${name}.json`, body, { mode: 0o600 });
        summary[`${db}.${name}`] = { docs: docs.length, sha256: sha(body) };
      }
      fs.writeFileSync(
        `${DIR}/${db}.plan.json`,
        JSON.stringify({
          key,
          plan: p.plan,
          att: p.att.map((x) => oid(x._id)),
          lv: p.lv.map((x) => oid(x._id)),
        }),
        { mode: 0o600 },
      );
      summary[`${db}.planKey`] = key;
      summary[`${db}.stat`] = p.stat;
    } else if (mode === "apply") {
      const saved = JSON.parse(
        fs.readFileSync(`${DIR}/${db}.plan.json`, "utf8"),
      );
      if (saved.key !== key)
        throw new Error(
          `${db}: live scope differs from the backed-up manifest — recompute, not applying`,
        );
      const before = {};
      const after = {};
      for (const col of ["attendance_records", "leaves", "leavebalances"])
        before[col] = (await c.$runCommandRaw({ count: col })).n;
      const del = async (col, ids) => {
        let n = 0;
        for (let i = 0; i < ids.length; i += 500) {
          const r = await c.$runCommandRaw({
            delete: col,
            deletes: [
              {
                q: {
                  _id: { $in: ids.slice(i, i + 500).map((x) => ({ $oid: x })) },
                },
                limit: 0,
              },
            ],
          });
          if (r.writeErrors) throw new Error(`${col} delete writeErrors`);
          n += r.n;
        }
        return n;
      };
      const delAtt = await del("attendance_records", saved.att);
      const delLv = await del("leaves", saved.lv);
      const delLb = await del(
        "leavebalances",
        saved.plan.filter((x) => x.action === "delete-row").map((x) => x.id),
      );
      let upd = 0;
      for (const r of saved.plan.filter((x) => x.action === "repair-ledger")) {
        const res = await c.$runCommandRaw({
          update: "leavebalances",
          updates: [
            {
              q: { _id: { $oid: r.id } },
              u: {
                $set: {
                  balances: r.balances,
                  accumulatedPLBeforeCurrentMonth:
                    r.accumulatedPLBeforeCurrentMonth,
                },
              },
            },
          ],
        });
        if (res.writeErrors)
          throw new Error("leavebalances update writeErrors");
        upd += res.nModified;
      }
      for (const col of ["attendance_records", "leaves", "leavebalances"])
        after[col] = (await c.$runCommandRaw({ count: col })).n;
      const dup = await aggregateAll(c, "attendance_records", [
        { $group: { _id: { u: "$userId", d: "$date" }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $count: "g" },
      ]);
      const lbDup = await aggregateAll(c, "leavebalances", [
        { $group: { _id: "$userId", n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $count: "g" },
      ]);
      const left = await computePlan(c, db);
      summary[db] = {
        before,
        after,
        deleted: { attendance: delAtt, leaves: delLv, leavebalanceRows: delLb },
        ledgerRowsModified: upd,
        attendanceDupGroups: dup[0]?.g || 0,
        leavebalanceDupUsers: lbDup[0]?.g || 0,
        signatureRemaining: {
          attendance: left.att.length,
          leaves: left.lv.length,
          ledgerEntriesStillMatching: left.stat.entriesMatched,
        },
      };
    }
    await c.$disconnect();
  }
  console.log(JSON.stringify(summary));
  await m.$disconnect();
})().catch((e) => {
  console.error(
    "ERR",
    e.message.replace(/mongodb(\+srv)?:\/\/[^\s"]+/g, "<uri>"),
  );
  process.exit(1);
});
