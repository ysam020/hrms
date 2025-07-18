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
