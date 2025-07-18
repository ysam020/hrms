import { base64urlToArrayBuffer } from "./base64urlToArrayBuffer";

export function base64urlToUint8Array(base64url) {
  return new Uint8Array(base64urlToArrayBuffer(base64url));
}
