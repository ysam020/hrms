export function debugChallengeConversion(originalChallenge) {
  console.log("🔍 DEBUG: Challenge conversion");
  console.log("   Original challenge:", originalChallenge);
  console.log("   Challenge type:", typeof originalChallenge);
  console.log("   Challenge length:", originalChallenge?.length);

  try {
    // Convert using base64url
    const buffer = base64url.toBuffer(originalChallenge);
    console.log("   Converted buffer length:", buffer.length);
    console.log("   Buffer first 10 bytes:", Array.from(buffer.slice(0, 10)));

    // Convert back to see if round-trip works
    const backToString = base64url.encode(buffer);
    console.log("   Round-trip back to string:", backToString);
    console.log(
      "   Round-trip matches original:",
      backToString === originalChallenge
    );

    return buffer;
  } catch (error) {
    console.error("❌ Challenge conversion failed:", error);
    throw error;
  }
}

export function debugCredentialConversion(credential) {
  console.log("🔍 DEBUG: Credential conversion");
  console.log("   Credential ID:", credential.id);
  console.log("   ID type:", typeof credential.id);

  if (typeof credential.id === "string") {
    try {
      const buffer = base64url.toBuffer(credential.id);
      console.log("   Converted ID buffer length:", buffer.length);
      return buffer;
    } catch (error) {
      console.error("❌ Credential ID conversion failed:", error);
      throw error;
    }
  } else {
    console.log(
      "   Credential ID is not a string, type:",
      typeof credential.id
    );
    return credential.id;
  }
}
