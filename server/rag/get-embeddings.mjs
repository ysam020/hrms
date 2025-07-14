import { pipeline } from "@xenova/transformers";

// Function to generate embeddings for a given data source
export async function getEmbedding(data) {
  try {
    // Validate input
    if (data === null || data === undefined) {
      throw new Error("Input data cannot be null or undefined");
    }

    // Convert to string if not already
    const textData = typeof data === "string" ? data : String(data);

    // Check if empty string
    if (textData.trim() === "") {
      throw new Error("Input data cannot be empty");
    }

    const embedder = await pipeline(
      "feature-extraction",
      "Xenova/nomic-embed-text-v1"
    );

    const results = await embedder(textData, {
      pooling: "mean",
      normalize: true,
    });

    return Array.from(results.data);
  } catch (error) {
    console.error("Error in getEmbedding:", error);
    throw error; // Re-throw to be handled by calling function
  }
}
