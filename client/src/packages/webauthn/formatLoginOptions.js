import { toArrayBuffer } from "./toArrayBuffer";

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
