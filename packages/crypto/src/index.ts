import crypto from "crypto";

// ─── AES-256-GCM (current) ────────────────────────────────────────────────────
// Format: <iv_hex>:<ciphertext_hex>:<auth_tag_hex>
//   IV  = 12 bytes  (96-bit, recommended for GCM)
//   Tag = 16 bytes  (128-bit authentication tag)
//
// Legacy AES-256-CBC format (read-only for migration):
//   <iv_hex>:<ciphertext_hex>   (IV = 16 bytes)
//
// CRYPTO_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
// Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const GCM_ALGORITHM = "aes-256-gcm";
const CBC_ALGORITHM = "aes-256-cbc";
const GCM_IV_LENGTH = 12;

const getKey = (): Buffer => {
  const key = process.env.CRYPTO_ENCRYPTION_KEY;
  if (!key) throw new Error("CRYPTO_ENCRYPTION_KEY is not set");
  if (!/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error(
      "CRYPTO_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return Buffer.from(key, "hex");
};

export function aesEncrypt(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(
    GCM_ALGORITHM,
    getKey(),
    iv,
  ) as crypto.CipherGCM;
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
}

export function aesDecrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");

  if (parts.length === 3) {
    // AES-256-GCM: iv:ciphertext:tag
    const [ivHex, ciphertext, tagHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(
      GCM_ALGORITHM,
      getKey(),
      iv,
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  if (parts.length === 2) {
    // Legacy AES-256-CBC: iv:ciphertext — read-only for migrating old values
    const [ivHex, ciphertext] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(CBC_ALGORITHM, getKey(), iv);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  throw new Error("Invalid encrypted value format");
}

/** Returns the decrypted value, or the original string if it doesn't look encrypted. */
export function safeDecrypt(value: string | null | undefined): string {
  if (!value) return "";
  // Encrypted values are hex:hex:hex (GCM) or hex:hex (CBC legacy)
  if (!/^[a-f0-9]+:[a-f0-9]+(:[a-f0-9]+)?$/i.test(value)) return value;
  try {
    return aesDecrypt(value);
  } catch {
    return value;
  }
}

export const SENSITIVE_FIELDS = [
  "aadhar_no",
  "aadhar_photo_front",
  "aadhar_photo_back",
  "pan_no",
  "pan_photo",
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
  "bank_account_no",
  "pf_no",
  "uan_no",
  "esic_no",
] as const;
