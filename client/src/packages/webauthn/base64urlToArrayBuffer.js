export function base64urlToArrayBuffer(input) {
  // Handle different input types
  let base64url;

  if (typeof input === "string") {
    base64url = input;
  } else if (input instanceof ArrayBuffer) {
    return input;
  } else if (input instanceof Uint8Array) {
    return input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength
    );
  } else if (Array.isArray(input)) {
    return new Uint8Array(input).buffer;
  } else if (
    input &&
    typeof input === "object" &&
    input.data &&
    Array.isArray(input.data)
  ) {
    return new Uint8Array(input.data).buffer;
  } else {
    throw new Error(
      `Invalid input type for base64url conversion: ${typeof input}. Expected string, ArrayBuffer, Uint8Array, or Array.`
    );
  }

  if (!base64url || base64url.length === 0) {
    throw new Error("Empty base64url string");
  }

  try {
    // Add padding if needed
    const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + padding;

    // Convert base64 to binary string
    const binaryString = atob(base64);

    // Convert binary string to ArrayBuffer
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes.buffer;
  } catch (error) {
    console.error("❌ Base64url conversion failed:", error);
    console.error("   Input was:", base64url);
    throw new Error(`Failed to convert base64url: ${error.message}`);
  }
}
