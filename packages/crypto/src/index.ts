import crypto from "crypto";

const getKey = (): Buffer => {
  const key = process.env.CRYPTO_ENCRYPTION_KEY;
  if (!key) throw new Error("CRYPTO_ENCRYPTION_KEY is not set");
  return Buffer.from(key, "hex");
};

export function aesEncrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", getKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function aesDecrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts.shift()!, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", getKey(), iv);
  let decrypted = decipher.update(parts.join(":"), "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Returns the decrypted value, or the original string if it doesn't look encrypted
export function safeDecrypt(value: string | null | undefined): string {
  if (!value) return "";
  // Encrypted values are hex:hex — if format doesn't match, return as-is
  if (!/^[a-f0-9]+:[a-f0-9]+$/i.test(value)) return value;
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
