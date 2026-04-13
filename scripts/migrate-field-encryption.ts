/**
 * One-time migration: encrypt plaintext PII fields and re-encrypt any legacy
 * AES-256-CBC values as AES-256-GCM in the users collection.
 *
 * Run ONCE after deploying the encryption changes:
 *   AES_SECRET_KEY=<key> MONGO_URI=<uri> npx tsx scripts/migrate-field-encryption.ts
 *
 * The script is idempotent — already-GCM values are skipped, so it is safe
 * to re-run if interrupted.
 */

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

// ─── Inline encryption helpers ────────────────────────────────────────────────
// We inline rather than import from @hrms/common to keep the script standalone
// and runnable without a full build.

const GCM_IV_LEN = 12; // bytes (96-bit, GCM recommended)

function getKey(): Buffer {
  const raw = process.env.AES_SECRET_KEY;
  if (!raw) throw new Error("AES_SECRET_KEY environment variable is required");
  if (!/^[a-f0-9]{64}$/i.test(raw))
    throw new Error(
      "AES_SECRET_KEY must be a 64-character hex string (32 bytes)",
    );
  return Buffer.from(raw, "hex");
}

function gcmEncrypt(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    getKey(),
    iv,
  ) as crypto.CipherGCM;
  let enc = cipher.update(text, "utf8", "hex");
  enc += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${enc}:${tag.toString("hex")}`;
}

function decrypt(value: string): string {
  const parts = value.split(":");
  if (parts.length === 3) {
    // GCM: iv:ciphertext:tag
    const iv = Buffer.from(parts[0], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const d = crypto.createDecipheriv(
      "aes-256-gcm",
      getKey(),
      iv,
    ) as crypto.DecipherGCM;
    d.setAuthTag(tag);
    let out = d.update(parts[1], "hex", "utf8");
    out += d.final("utf8");
    return out;
  }
  if (parts.length === 2) {
    // Legacy CBC: iv:ciphertext
    const iv = Buffer.from(parts[0], "hex");
    const d = crypto.createDecipheriv("aes-256-cbc", getKey(), iv);
    let out = d.update(parts[1], "hex", "utf8");
    out += d.final("utf8");
    return out;
  }
  throw new Error(
    `Unknown encrypted format for value starting with: ${value.slice(0, 20)}`,
  );
}

function isGcm(v: string): boolean {
  const p = v.split(":");
  return (
    p.length === 3 &&
    /^[a-f0-9]+$/i.test(p[0]) &&
    Buffer.from(p[0], "hex").length === GCM_IV_LEN
  );
}

function isCbc(v: string): boolean {
  const p = v.split(":");
  return (
    p.length === 2 &&
    /^[a-f0-9]+$/i.test(p[0]) &&
    /^[a-f0-9]+$/i.test(p[1]) &&
    Buffer.from(p[0], "hex").length === 16 // CBC uses 16-byte IV
  );
}

// ─── Sensitive fields to migrate ─────────────────────────────────────────────

const SENSITIVE_FIELDS = [
  "aadhar_no",
  "pan_no",
  "bank_account_no",
  "pf_no",
  "uan_no",
  "esic_no",
  "mobile",
  "permanent_address_line_1",
  "permanent_address_line_2",
  "permanent_address_city",
  "permanent_address_state",
  "permanent_address_pincode",
  "communication_address_line_1",
  "communication_address_line_2",
  "communication_address_city",
  "communication_address_state",
  "communication_address_pincode",
] as const;

type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

// ─── Migration ────────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();

  try {
    const total = await prisma.user.count();
    console.log(`Starting migration for ${total} user records…`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const BATCH = 100;

    for (let skip = 0; skip < total; skip += BATCH) {
      const users = await prisma.user.findMany({ skip, take: BATCH });

      for (const user of users) {
        const updates: Partial<Record<SensitiveField, string>> = {};

        for (const field of SENSITIVE_FIELDS) {
          const raw = user[field] as string | null | undefined;
          if (!raw) continue;

          if (isGcm(raw)) {
            // Already GCM — verify it decrypts correctly, then skip
            try {
              decrypt(raw);
            } catch {
              console.warn(
                `  [WARN] user ${user.id}: ${field} has GCM format but failed to decrypt — skipping`,
              );
            }
            continue;
          }

          if (isCbc(raw)) {
            // Legacy CBC — decrypt then re-encrypt as GCM
            try {
              const plaintext = decrypt(raw);
              updates[field] = gcmEncrypt(plaintext);
            } catch (err) {
              console.error(
                `  [ERROR] user ${user.id}: CBC re-encrypt failed for ${field}:`,
                err,
              );
              errors++;
            }
            continue;
          }

          // Plaintext — encrypt as GCM
          updates[field] = gcmEncrypt(raw);
        }

        if (Object.keys(updates).length === 0) {
          skipped++;
          continue;
        }

        try {
          await prisma.user.update({ where: { id: user.id }, data: updates });
          migrated++;
          if (migrated % 50 === 0) {
            console.log(`  Migrated ${migrated}/${total}…`);
          }
        } catch (err) {
          console.error(`  [ERROR] Failed to update user ${user.id}:`, err);
          errors++;
        }
      }
    }

    console.log(`\nMigration complete:`);
    console.log(`  Migrated : ${migrated}`);
    console.log(`  Skipped  : ${skipped} (already GCM or no PII data)`);
    console.log(`  Errors   : ${errors}`);

    if (errors > 0) {
      console.error("\nSome records failed — inspect logs above and re-run.");
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
