import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

export default function aesEncrypt(text) {
  const IV_LENGTH = 16;
  if (!process.env.CRYPTO_ENCRYPTION_KEY) {
    console.error("Encryption key is missing.");
    return null;
  }

  const iv = crypto.randomBytes(IV_LENGTH); // Generate random IV
  const cipher = crypto.createCipheriv(
    "aes-256-cbc", // Use AES-256-CBC for stronger encryption
    Buffer.from(process.env.CRYPTO_ENCRYPTION_KEY, "hex"), // The encryption key should be in Buffer format
    iv
  );

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted; // Combine IV with the encrypted text
}
