import {
  base64urlToArrayBuffer,
  arrayBufferToBase64url,
} from "./base64urlUtils.js";

export function testBase64urlConversions() {
  // Test with a known challenge
  const testChallenge = "b_r2e_XnMFz5CUs-tcrKXhWCVLS8VDANTYRdXAfAQQE";

  try {
    // Convert to ArrayBuffer
    const buffer = base64urlToArrayBuffer(testChallenge);

    // Convert back to base64url
    const backToString = arrayBufferToBase64url(buffer);

    // Check if round-trip works
    const matches = backToString === testChallenge;

    if (!matches) {
    }

    return matches;
  } catch (error) {
    console.error("❌ Conversion test failed:", error);
    return false;
  }
}
