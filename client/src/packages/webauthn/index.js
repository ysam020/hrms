export function base64urlToArrayBuffer(input) {
  console.log("🔄 Converting to ArrayBuffer:", {
    input: typeof input === "string" ? input.substring(0, 20) + "..." : input,
    type: typeof input,
    isArray: Array.isArray(input),
    constructor: input?.constructor?.name,
  });

  // Handle different input types
  let base64url;

  if (typeof input === "string") {
    base64url = input;
  } else if (input instanceof ArrayBuffer) {
    console.log("   Input is already ArrayBuffer, returning as-is");
    return input;
  } else if (input instanceof Uint8Array) {
    console.log("   Input is Uint8Array, returning buffer");
    return input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength
    );
  } else if (Array.isArray(input)) {
    console.log("   Input is Array, converting to Uint8Array buffer");
    return new Uint8Array(input).buffer;
  } else if (
    input &&
    typeof input === "object" &&
    input.data &&
    Array.isArray(input.data)
  ) {
    console.log("   Input is object with data array");
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

    console.log(
      "   ✅ Converted successfully, length:",
      bytes.buffer.byteLength
    );
    return bytes.buffer;
  } catch (error) {
    console.error("❌ Base64url conversion failed:", error);
    console.error("   Input was:", base64url);
    throw new Error(`Failed to convert base64url: ${error.message}`);
  }
}

export function arrayBufferToBase64url(buffer) {
  if (!buffer) {
    throw new Error("Buffer is null or undefined");
  }

  let bytes;
  if (buffer instanceof ArrayBuffer) {
    bytes = new Uint8Array(buffer);
  } else if (buffer instanceof Uint8Array) {
    bytes = buffer;
  } else if (Array.isArray(buffer)) {
    bytes = new Uint8Array(buffer);
  } else {
    throw new Error(`Invalid buffer type: ${typeof buffer}`);
  }

  let binaryString = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }

  const base64 = btoa(binaryString);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function base64urlToUint8Array(base64url) {
  return new Uint8Array(base64urlToArrayBuffer(base64url));
}

export function toArrayBuffer(input) {
  return base64urlToArrayBuffer(input);
}
