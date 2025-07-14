import crypto from "crypto";

// Decrypt function using AES-256
export default function aesDecrypt(encryptedText) {
  const textParts = encryptedText.split(":");
  const iv = Buffer.from(textParts.shift(), "hex"); // Extract the IV
  const encryptedTextContent = textParts.join(":"); // Join the remaining encrypted text

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc", // Use AES-256-CBC
    Buffer.from(process.env.CRYPTO_ENCRYPTION_KEY, "hex"), // Ensure the key is 256-bit
    iv
  );

  let decrypted = decipher.update(encryptedTextContent, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
