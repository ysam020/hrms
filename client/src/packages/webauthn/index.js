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

export function formatLoginOptions(options) {
  // Convert challenge
  try {
    options.challenge = toArrayBuffer(options.challenge);
  } catch (error) {
    console.error("Error converting challenge:", error);
    throw new Error(`Invalid challenge format: ${error.message}`);
  }

  // Convert allowCredentials safely
  if (options.allowCredentials && Array.isArray(options.allowCredentials)) {
    options.allowCredentials.forEach((cred, index) => {
      try {
        cred.id = toArrayBuffer(cred.id);
      } catch (error) {
        console.error(`Error converting credential ${index}:`, error);
        throw new Error(`Invalid credential ID format: ${error.message}`);
      }
    });
  }

  return options;
}

export async function getCredential(options) {
  return await navigator.credentials.get({
    publicKey: options,
  });
}

export function serializeCredential(credential) {
  return {
    id: credential.id,
    type: credential.type,
    rawId: Array.from(new Uint8Array(credential.rawId)),
    response: {
      authenticatorData: Array.from(
        new Uint8Array(credential.response.authenticatorData)
      ),
      clientDataJSON: Array.from(
        new Uint8Array(credential.response.clientDataJSON)
      ),
      signature: Array.from(new Uint8Array(credential.response.signature)),
      userHandle: credential.response.userHandle
        ? Array.from(new Uint8Array(credential.response.userHandle))
        : null,
    },
  };
}

export function urlBase64ToUint8Array(base64String) {
  // Add padding if needed
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  // Convert base64 to binary string
  const rawData = atob(base64);

  // Convert to Uint8Array
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
