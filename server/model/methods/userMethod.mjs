import aesEncrypt from "../../utils/aesEncrypt.mjs";
import aesDecrypt from "../../utils/aesDecrypt.mjs";
import bcrypt from "bcrypt";

// Method to generate backup codes
export const generateBackupCodes = function (numCodes = 10) {
  const codes = [];
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; // Characters to use in codes

  for (let i = 0; i < numCodes; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      code += characters[randomIndex];
    }
    codes.push(code);
  }

  const encryptedCodes = codes.map((code) => aesEncrypt(code));
  this.backupCodes = encryptedCodes;
  return codes;
};

// Method to get full name
export const getFullName = function () {
  return [this.first_name, this.middle_name, this.last_name]
    .filter(Boolean)
    .join(" ");
};

// Method to encrypt a field
export const encryptField = function (field, value) {
  if (!value)
    throw new Error(`Value for field "${field}" is missing or empty.`);
  const encrypted = aesEncrypt(value);
  if (!encrypted) throw new Error(`Encryption failed for field "${field}".`);
  this[field] = encrypted;
};

// Method to decrypt a field
export const decryptField = function (field, value) {
  if (!this[field]) {
    throw new Error(`Field "${field}" is missing or empty.`);
  }
  const decrypted = aesDecrypt(value);
  if (!decrypted) {
    throw new Error(`Decryption failed for field "${field}".`);
  }
  return decrypted;
};

// Method to reset block status
export const resetBlockStatus = function () {
  this.failedLoginAttempts = 0;
  this.firstFailedLoginAt = null;
  this.isBlocked = false;
  this.blockedUntil = null;
};

export const isPasswordCorrect = async function (password) {
  try {
    const isMatch = await bcrypt.compare(password, this.password);
    return isMatch;
  } catch (error) {
    throw new Error("Error comparing password", error);
  }
};
