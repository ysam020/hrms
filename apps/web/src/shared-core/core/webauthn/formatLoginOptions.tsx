import { toArrayBuffer } from "./toArrayBuffer";

export function formatLoginOptions(options: any) {
  // Convert challenge
  try {
    options.challenge = toArrayBuffer(options.challenge);
  } catch (error: any) {
    console.error("Error converting challenge:", error);
    throw new Error(`Invalid challenge format: ${error.message}`);
  }

  if (options.allowCredentials && Array.isArray(options.allowCredentials)) {
    options.allowCredentials.forEach((cred: any, index: number) => {
      try {
        cred.id = toArrayBuffer(cred.id);
      } catch (error: any) {
        console.error(`Error converting credential ${index}:`, error);
        throw new Error(`Invalid credential ID format: ${error.message}`);
      }
    });
  }

  return options;
}
