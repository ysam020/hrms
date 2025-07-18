import {
  base64urlToArrayBuffer,
  arrayBufferToBase64url,
} from "./base64urlUtils.js";

export function testBase64urlConversions() {
  console.log("🧪 Testing base64url conversions...");

  // Test with a known challenge
  const testChallenge = "b_r2e_XnMFz5CUs-tcrKXhWCVLS8VDANTYRdXAfAQQE";

  try {
    // Convert to ArrayBuffer
    const buffer = base64urlToArrayBuffer(testChallenge);
    console.log("✅ Converted to buffer, length:", buffer.byteLength);

    // Convert back to base64url
    const backToString = arrayBufferToBase64url(buffer);
    console.log("✅ Converted back to string:", backToString);

    // Check if round-trip works
    const matches = backToString === testChallenge;
    console.log("✅ Round-trip successful:", matches);

    if (!matches) {
      console.log("   Original:", testChallenge);
      console.log("   Round-trip:", backToString);
    }

    return matches;
  } catch (error) {
    console.error("❌ Conversion test failed:", error);
    return false;
  }
}
