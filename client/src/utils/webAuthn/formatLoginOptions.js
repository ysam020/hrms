// Updated client/src/utils/webAuthn/formatLoginOptions.js
import { toArrayBuffer } from "./base64urlUtils.js";

export function formatLoginOptions(options) {
  console.log("🔧 Formatting login options...");
  console.log("   Original options:", {
    challenge: options.challenge,
    challengeType: typeof options.challenge,
    allowCredentialsCount: options.allowCredentials?.length,
  });

  // ✅ Convert challenge safely
  try {
    options.challenge = toArrayBuffer(options.challenge);
    console.log(
      "   ✅ Challenge converted, length:",
      options.challenge.byteLength
    );
  } catch (error) {
    console.error("❌ Error converting challenge:", error);
    throw new Error(`Invalid challenge format: ${error.message}`);
  }

  // ✅ Convert allowCredentials safely
  if (options.allowCredentials && Array.isArray(options.allowCredentials)) {
    options.allowCredentials.forEach((cred, index) => {
      console.log(`   Processing credential ${index}:`, {
        id: cred.id,
        idType: typeof cred.id,
        type: cred.type,
      });

      try {
        cred.id = toArrayBuffer(cred.id);
        console.log(
          `   ✅ Credential ${index} ID converted, length:`,
          cred.id.byteLength
        );
      } catch (error) {
        console.error(`❌ Error converting credential ${index}:`, error);
        throw new Error(`Invalid credential ID format: ${error.message}`);
      }
    });
  }

  console.log("✅ Login options formatted successfully");
  return options;
}
