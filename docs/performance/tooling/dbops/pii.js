// node dbops/pii.js backup|apply — hrms-acme-corp applicant PII (D12). Prints counts only.
const fs = require("fs");
const crypto = require("crypto");
const { master, forDb, aggregateAll } = require("./common");
const DIR = "/tmp/praesto-pii";
const DB = "hrms-acme-corp";
const BUCKET = "praesto-189923011190",
  REGION = "ap-south-1";
const isClear = (v) => typeof v === "string" && v !== "" && v !== "[REDACTED]";
const bigStr = (v) => typeof v === "string" && Buffer.byteLength(v) > 1024;
const oid = (x) => (x && x.$oid) || String(x);
function redactSnap(v, entityType) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    return { v, changed: false };
  const out = { ...v };
  let changed = false;
  if (isClear(out.aadharNo)) {
    out.aadharNo = "[REDACTED]";
    changed = true;
  }
  if (bigStr(out.resume)) {
    out.resume = `[OMITTED: ${Buffer.byteLength(out.resume)} bytes]`;
    changed = true;
  }
  if (
    entityType === "ApplicationDraft" &&
    out.data &&
    typeof out.data === "object"
  ) {
    out.data = "[OMITTED]";
    changed = true;
  }
  return { v: out, changed };
}
async function scope(c) {
  const apps = await aggregateAll(c, "jobapplications", [
    {
      $match: {
        $or: [
          { aadharNo: { $type: "string", $nin: ["", "[REDACTED]"] } },
          { resume: { $regex: "^data:" } },
        ],
      },
    },
  ]);
  const audit = (
    await aggregateAll(c, "auditlogs", [
      {
        $match: { entityType: { $in: ["JobApplication", "ApplicationDraft"] } },
      },
    ])
  ).filter(
    (r) =>
      redactSnap(r.oldValue, r.entityType).changed ||
      redactSnap(r.newValue, r.entityType).changed,
  );
  return { apps, audit };
}
(async () => {
  const mode = process.argv[2];
  const m = await master();
  const c = forDb(DB);
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const s = await scope(c);
  const ids = JSON.stringify({
    apps: s.apps.map((a) => oid(a._id)).sort(),
    audit: s.audit.map((a) => oid(a._id)).sort(),
  });
  if (mode === "backup") {
    fs.writeFileSync(`${DIR}/jobapplications.json`, JSON.stringify(s.apps), {
      mode: 0o600,
    });
    fs.writeFileSync(`${DIR}/auditlogs.json`, JSON.stringify(s.audit), {
      mode: 0o600,
    });
    fs.writeFileSync(`${DIR}/ids.json`, ids, { mode: 0o600 });
    console.log(
      JSON.stringify({
        apps: s.apps.length,
        audit: s.audit.length,
        byType: s.audit.reduce(
          (a, r) => ((a[r.entityType] = (a[r.entityType] || 0) + 1), a),
          {},
        ),
      }),
    );
  } else if (mode === "apply") {
    if (fs.readFileSync(`${DIR}/ids.json`, "utf8") !== ids)
      throw new Error(
        "live PII scope differs from the backup — recompute, not applying",
      );
    const {
      S3Client,
      PutObjectCommand,
      HeadObjectCommand,
    } = require("/app/apps/api-gateway/node_modules/@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: REGION,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    let uploaded = 0,
      appsUpdated = 0,
      auditUpdated = 0;
    for (const a of s.apps) {
      const set = { aadharNo: null };
      if (typeof a.resume === "string" && a.resume.startsWith("data:")) {
        const mt = a.resume.match(/^data:([^;,]+)?(;base64)?,/);
        if (!mt || !mt[2]) throw new Error("unexpected resume encoding");
        const contentType = mt[1] || "application/pdf";
        if (contentType !== "application/pdf")
          throw new Error("non-pdf resume; stopping");
        const body = Buffer.from(a.resume.slice(mt[0].length), "base64");
        const tenantId = oid(a.tenantId);
        const key = `job_applications/${tenantId}/${crypto.randomUUID()}.pdf`;
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        );
        const head = await s3.send(
          new HeadObjectCommand({ Bucket: BUCKET, Key: key }),
        );
        if (head.ContentLength !== body.length)
          throw new Error("uploaded size mismatch; stopping before DB update");
        uploaded++;
        set.resume = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
      }
      const r = await c.$runCommandRaw({
        update: "jobapplications",
        updates: [{ q: { _id: { $oid: oid(a._id) } }, u: { $set: set } }],
      });
      if (r.writeErrors) throw new Error("jobapplications update writeErrors");
      appsUpdated += r.nModified;
    }
    for (const r of s.audit) {
      const set = {};
      const o = redactSnap(r.oldValue, r.entityType),
        n = redactSnap(r.newValue, r.entityType);
      if (o.changed) set.oldValue = o.v;
      if (n.changed) set.newValue = n.v;
      const res = await c.$runCommandRaw({
        update: "auditlogs",
        updates: [{ q: { _id: { $oid: oid(r._id) } }, u: { $set: set } }],
      });
      if (res.writeErrors) throw new Error("auditlogs update writeErrors");
      auditUpdated += res.nModified;
    }
    const after = await scope(c);
    const leftData = await aggregateAll(c, "jobapplications", [
      { $match: { resume: { $regex: "^data:" } } },
      { $count: "n" },
    ]);
    console.log(
      JSON.stringify({
        uploaded,
        appsUpdated,
        auditUpdated,
        remaining: {
          appsWithPii: after.apps.length,
          auditRowsWithPii: after.audit.length,
          inlineResumes: leftData[0]?.n || 0,
        },
      }),
    );
  }
  await c.$disconnect();
  await m.$disconnect();
})().catch((e) => {
  console.error(
    "ERR",
    e.message.replace(/mongodb(\+srv)?:\/\/[^\s"]+/g, "<uri>"),
  );
  process.exit(1);
});
