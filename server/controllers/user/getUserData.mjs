import UserModel from "../../model/userModel.mjs";
import { cacheResponse, getCachedData } from "../../utils/cacheResponse.mjs";
import aesDecrypt from "../../utils/aesDecrypt.mjs";
import { SENSITIVE_FIELDS } from "../../assets/sensitiveFields.mjs";

const getUserData = async (req, res, next) => {
  try {
    const { username } = req.params;
    const cacheKey = `userData:${username}`;

    // Check Redis cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      // Decrypt sensitive fields in cached data before sending
      SENSITIVE_FIELDS.forEach((field) => {
        if (cachedData[field]) {
          try {
            cachedData[field] = aesDecrypt(cachedData[field]);
          } catch (decryptError) {
            console.error(`Error decrypting ${field}:`, decryptError);
            // Keep encrypted value if decryption fails
          }
        }
      });
      return res.status(200).json(cachedData);
    }

    // Fetch from MongoDB if not found in cache
    const user = await UserModel.findOne({ username }).select(
      "-password -sessions -resetPasswordOTP -resetPasswordExpires -failedLoginAttempts -firstFailedLoginAt -isBlocked -blockedUntil -isTwoFactorEnabled -twoFactorSecret -qrCodeImage -backupCodes -webAuthnCredentials -fcmTokens -note -events -__v"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Convert to plain object for manipulation
    const userData = user.toObject();

    // Add full name
    userData.fullName = user.getFullName();

    // Decrypt sensitive fields before caching and sending
    SENSITIVE_FIELDS.forEach((field) => {
      if (userData[field]) {
        try {
          userData[field] = aesDecrypt(userData[field]);
        } catch (decryptError) {
          console.error(`Error decrypting ${field}:`, decryptError);
          // Keep encrypted value if decryption fails
        }
      }
    });

    // Cache the response with decrypted values
    // Note: Consider if you want to cache with encrypted or decrypted values based on security requirements
    await cacheResponse(cacheKey, userData);

    res.status(200).json(userData);
  } catch (err) {
    console.error("Error in getUserData:", err);
    next(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export default getUserData;
