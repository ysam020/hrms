import { base64urlToArrayBuffer } from "./base64urlToArrayBuffer";

export function toArrayBuffer(input: unknown) {
  return base64urlToArrayBuffer(input);
}
