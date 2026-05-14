/**
 * One-time migration script: convert String date fields to BSON Date in MongoDB.
 *
 * Run ONCE against your database after deploying the Prisma schema changes:
 *   node scripts/migrate-dates.mjs
 *
 * Safe to re-run — already-converted Date fields are skipped.
 */

import { MongoClient } from "mongodb";

const URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  process.env.DEV_MONGODB_URI;
if (!URI) {
  console.error(
    "Set MONGODB_URI, DATABASE_URL, or DEV_MONGODB_URI before running this script",
  );
  process.exit(1);
}

const client = new MongoClient(URI);

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value; // already migrated
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Convert a string field to Date in-place, returning true if the doc needs updating. */
function convertField(doc, field) {
  if (doc[field] == null || doc[field] instanceof Date) return false;
  const converted = toDate(doc[field]);
  if (converted === null) {
    console.warn(`  Skipping unparseable ${field}: ${doc[field]} (id=${doc._id})`);
    return false;
  }
  doc[field] = converted;
  return true;
}

async function migrateCollection(db, collectionName, fields) {
  const col = db.collection(collectionName);
  const cursor = col.find({});
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    let dirty = false;
    for (const field of fields) {
      if (convertField(doc, field)) dirty = true;
    }
    if (dirty) {
      const updateDoc = {};
      for (const field of fields) {
        if (doc[field] !== undefined) updateDoc[field] = doc[field];
      }
      await col.updateOne({ _id: doc._id }, { $set: updateDoc });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`  ${collectionName}: updated=${updated}, skipped=${skipped}`);
}

/**
 * Holiday.holidays is a JSON array with embedded {date: string, createdOn: string}.
 * We keep date as YYYY-MM-DD string (used for human-readable keys in holiday lookups).
 * Only createdOn inside the array is converted to ISO string for consistency.
 * No BSON Date conversion needed here — the outer year/month are already integers.
 */
async function migrateHolidayEmbedded(db) {
  const col = db.collection("holidays");
  const cursor = col.find({});
  let updated = 0;

  for await (const doc of cursor) {
    if (!Array.isArray(doc.holidays)) continue;
    let dirty = false;
    const newList = doc.holidays.map((h) => {
      if (h.createdOn && typeof h.createdOn === "string") {
        const d = new Date(h.createdOn);
        if (!isNaN(d.getTime())) {
          dirty = true;
          return { ...h, createdOn: d.toISOString() };
        }
      }
      return h;
    });
    if (dirty) {
      await col.updateOne({ _id: doc._id }, { $set: { holidays: newList } });
      updated++;
    }
  }

  console.log(`  holidays (embedded): updated=${updated}`);
}

/**
 * HrActivity: merge the old String `date` + String `time` fields into `scheduledAt` DateTime.
 * If scheduledAt already exists, skip.
 */
async function migrateHrActivities(db) {
  const col = db.collection("hractivities");
  const cursor = col.find({ scheduledAt: { $exists: false } });
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    if (!doc.date) { skipped++; continue; }
    const dateStr = doc.date;
    const timeStr = doc.time || "00:00";
    const combined = new Date(`${dateStr}T${timeStr}`);
    if (isNaN(combined.getTime())) {
      console.warn(`  Skipping unparseable hrActivity date=${dateStr} time=${timeStr} (id=${doc._id})`);
      skipped++;
      continue;
    }
    const unsetFields = { date: "", time: "" };
    await col.updateOne(
      { _id: doc._id },
      {
        $set: { scheduledAt: combined },
        $unset: unsetFields,
      },
    );
    updated++;
  }

  console.log(`  hractivities: updated=${updated}, skipped=${skipped}`);
}

/**
 * Resignation: rename lastDate (String) → lastWorkingDay (Date) when lastWorkingDay is absent.
 * resignationDate String → DateTime.
 */
async function migrateResignations(db) {
  const col = db.collection("resignations");
  const cursor = col.find({});
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    let dirty = false;
    const updateSet = {};
    const updateUnset = {};

    // resignationDate: String → Date
    if (doc.resignationDate && typeof doc.resignationDate === "string") {
      const d = toDate(doc.resignationDate);
      if (d) { updateSet.resignationDate = d; dirty = true; }
    }

    // lastDate String → merge into lastWorkingDay DateTime
    if (doc.lastDate && typeof doc.lastDate === "string" && !doc.lastWorkingDay) {
      const d = toDate(doc.lastDate);
      if (d) { updateSet.lastWorkingDay = d; dirty = true; }
    }
    if (doc.lastDate !== undefined) {
      updateUnset.lastDate = "";
      dirty = true;
    }

    if (dirty) {
      const ops = {};
      if (Object.keys(updateSet).length) ops.$set = updateSet;
      if (Object.keys(updateUnset).length) ops.$unset = updateUnset;
      await col.updateOne({ _id: doc._id }, ops);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`  resignations: updated=${updated}, skipped=${skipped}`);
}

async function main() {
  await client.connect();
  const dbName = new URL(URI).pathname.slice(1);
  const db = client.db(dbName);
  console.log(`Connected to database: ${dbName}`);

  console.log("\n[users] — dob, joining_date, dateOfTermination, dateOfAbscond, kyc_date");
  await migrateCollection(db, "users", [
    "dob",
    "joining_date",
    "dateOfTermination",
    "dateOfAbscond",
    "kyc_date",
  ]);

  console.log("\n[attendance_records] — timeIn, timeOut (were ISO string, now DateTime)");
  await migrateCollection(db, "attendance_records", ["timeIn", "timeOut"]);

  console.log("\n[leaves] — from, to, appliedOn, approvedOn");
  await migrateCollection(db, "leaves", ["from", "to", "appliedOn", "approvedOn"]);

  console.log("\n[resignations] — resignationDate, lastDate→lastWorkingDay");
  await migrateResignations(db);

  console.log("\n[hractivities] — date+time → scheduledAt");
  await migrateHrActivities(db);

  console.log("\n[holidays] — embedded createdOn strings (normalise only)");
  await migrateHolidayEmbedded(db);

  console.log("\nMigration complete.");
  await client.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
