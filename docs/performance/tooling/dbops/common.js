// Runs inside the hrms-dev-api-gateway container (secrets are loaded in-process;
// nothing here prints credentials, values or raw identifiers).
const path = "/app/packages/database/node_modules/";
const { PrismaClient } = require(path + "@prisma/client");
const { loadSecrets } = require("/app/packages/common/dist/loadSecrets.js");
async function master() {
  await loadSecrets(process.env.AWS_SECRET_NAME || "hrms/config/docker");
  return new PrismaClient({ datasourceUrl: process.env.DEV_MONGODB_URI });
}
function forDb(dbName) {
  const base = process.env.DEV_MONGODB_URI;
  return new PrismaClient({
    datasourceUrl: base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`),
  });
}
// Single-batch only: on the Atlas proxy a getMore can land on a different
// connection (CursorNotFound), so results must fit one 16 MB batch.
async function aggregateAll(client, coll, pipeline) {
  const r = await client.$runCommandRaw({
    aggregate: coll,
    pipeline,
    cursor: { batchSize: 1000000 },
  });
  const id = r.cursor.id;
  const idNum = (x) =>
    x && typeof x === "object" && "$numberLong" in x
      ? x.$numberLong
      : String(x);
  if (idNum(id) !== "0")
    throw new Error(
      `aggregate ${coll}: result exceeds one batch; narrow the pipeline`,
    );
  return r.cursor.firstBatch;
}
const oidRange = (fromIso, toIso) => ({
  $expr: {
    $and: [
      {
        $gte: [
          { $toDate: "$_id" },
          { $dateFromString: { dateString: fromIso } },
        ],
      },
      {
        $lte: [{ $toDate: "$_id" }, { $dateFromString: { dateString: toIso } }],
      },
    ],
  },
});
module.exports = { master, forDb, aggregateAll, oidRange };
