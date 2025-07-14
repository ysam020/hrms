import crypto from "crypto";
import base64url from "base64url";

// Function to generate a random challenge
export function generateChallenge() {
  const randomBytes = crypto.randomBytes(32);
  return base64url.encode(randomBytes);
}
