export function urlBase64ToUint8Array(base64String: string) {
  if (!base64String || typeof base64String !== "string") {
    throw new Error("Invalid base64 string provided");
  }

  try {
    const cleaned = base64String.trim();
    const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
    const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  } catch (error: any) {
    console.error("Failed to decode base64url string:", base64String);
    console.error("Error:", error);
    throw new Error(`Failed to decode base64url string: ${error.message}`);
  }
}
