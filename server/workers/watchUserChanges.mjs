import { parentPort } from "worker_threads";
import dotenv from "dotenv";
import UserModel from "../model/userModel.mjs";
import { cacheResponse } from "../utils/cacheResponse.mjs";
import connectDB, { connectionCleanup } from "../connectDb.mjs";

dotenv.config();

// Function to watch user collection for changes
const watchUserChanges = async () => {
  try {
    const changeStream = UserModel.watch();

    changeStream.on("change", async (change) => {
      const userId = change.documentKey._id;

      // Always update KYC cache, even if user is deleted
      const kycUsers = await UserModel.find(
        {},
        "first_name middle_name last_name username email department designation kyc_approval"
      );
      await cacheResponse("kyc_records", kycUsers.reverse());

      // Fetch user details only if NOT a delete operation
      if (change.operationType !== "delete") {
        const user = await UserModel.findById(userId).select(
          "username rank first_name middle_name last_name employee_photo email modules dob blood_group official_email mobile communication_address_line_1 communication_address_line_2 communication_address_city communication_address_state communication_address_pincode permanent_address_line_1 permanent_address_line_2 permanent_address_city permanent_address_state permanent_address_pincode designation department joining_date bank_account_no bank_name ifsc_code aadhar_no aadhar_photo_front pan_no pan_photo pf_no uan_no esic_no backupCodes isTwoFactorEnabled qrCodeImage twoFactorSecret"
        );

        const fullName = user.getFullName();

        if (user) {
          // Fetch user data in required format for `getUserData`
          const userData = await UserModel.findOne({
            username: user.username,
          }).select(
            "-password -sessions -resetPasswordOTP -resetPasswordExpires -failedLoginAttempts -firstFailedLoginAt -isBlocked -blockedUntil -isTwoFactorEnabled -twoFactorSecret -qrCodeImage -backupCodes -webAuthnCredentials -fcmTokens"
          );

          if (userData) {
            await cacheResponse(`userData:${user.username}`, {
              ...userData.toObject(),
              fullName,
            });
          }
        }
      }
    });

    changeStream.on("error", (error) => {
      console.error("[watchUserWorker] Change Stream Error:", error);
      parentPort?.postMessage(`Change Stream Error: ${error.message}`);

      // Attempt to restart the watch stream after an error
      setTimeout(() => {
        parentPort?.postMessage("Attempting to restart user change stream...");
        watchUserChanges().catch((err) => {
          console.error(
            "[watchUserWorker] Failed to restart change stream:",
            err
          );
        });
      }, 5000);
    });

    parentPort?.postMessage("User change stream initialized successfully");
  } catch (error) {
    console.error("[watchUserWorker] Error setting up Change Stream:", error);
    parentPort?.postMessage(`Failed to set up change stream: ${error.message}`);
    process.exit(1);
  }
};

// Initialize the worker
const initWorker = async () => {
  try {
    // Connect to MongoDB using the shared function
    await connectDB();

    // Set up connection cleanup handlers
    connectionCleanup();

    // Start watching for user changes
    await watchUserChanges();

    // Handle process termination
    process.on("SIGINT", async () => {
      parentPort?.postMessage("Worker shutting down (SIGINT)");
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      parentPort?.postMessage("Worker shutting down (SIGTERM)");
      process.exit(0);
    });
  } catch (error) {
    console.error("[watchUserWorker] Initialization Error:", error);
    parentPort?.postMessage(`Worker initialization failed: ${error.message}`);
    process.exit(1);
  }
};

// Start the worker
initWorker();
