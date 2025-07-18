import { MongoClient } from "mongodb";
import { getEmbedding } from "./get-embeddings.mjs";
import dotenv from "dotenv";
dotenv.config();

// Function to get the results of a vector query
export async function getQueryResults(query) {
  const client = new MongoClient(process.env.ATLAS_CONNECTION_STRING);

  try {
    // Validate input
    if (!query || typeof query !== "string" || query.trim() === "") {
      throw new Error("Query cannot be null, undefined, or empty");
    }

    // Get embedding for a query
    const queryEmbedding = await getEmbedding(query);

    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      throw new Error("Failed to generate valid embedding for query");
    }

    await client.connect();
    const db = client.db("hrms-dev");
    const collection = db.collection("rag_embeddings");

    // Check if collection exists and has documents
    const docCount = await collection.countDocuments();
    if (docCount === 0) {
      console.warn("No documents found in rag_embeddings collection");
      return [];
    }

    const pipeline = [
      {
        $vectorSearch: {
          index: "vector_index",
          queryVector: queryEmbedding,
          path: "embedding",
          exact: true,
          limit: 10, // Get more results to ensure we have options
        },
      },
      {
        $project: {
          _id: 0,
          originalId: 1,
          chunkIndex: 1,
          totalChunks: 1,
          content: 1,
          metadata: 1,
          score: { $meta: "vectorSearchScore" }, // Include similarity score
        },
      },
      {
        $sort: { score: -1 }, // Sort by score descending (highest first)
      },
    ];

    // Retrieve documents from Atlas using this Vector Search query
    const result = collection.aggregate(pipeline);

    const arrayOfQueryDocs = [];
    for await (const doc of result) {
      arrayOfQueryDocs.push(doc);
    }

    return arrayOfQueryDocs;
  } catch (err) {
    console.error("Error in getQueryResults:", err.stack);
    return []; // Return empty array instead of throwing
  } finally {
    try {
      await client.close();
    } catch (closeErr) {
      console.error("Error closing MongoDB connection:", closeErr);
    }
  }
}

// Function to get only the highest scoring result
export async function getBestMatch(query) {
  try {
    const allResults = await getQueryResults(query);
    return allResults.length > 0 ? allResults[0] : null;
  } catch (err) {
    console.error("Error in getBestMatch:", err.stack);
    return null;
  }
}

// Alternative function for debugging - get all documents
export async function getAllEmbeddedDocs(limit = 5) {
  const client = new MongoClient(process.env.ATLAS_CONNECTION_STRING);

  try {
    await client.connect();
    const db = client.db("hrms-dev");
    const collection = db.collection("rag_embeddings");

    const documents = await collection.find({}).limit(limit).toArray();
    return documents;
  } catch (err) {
    console.error("Error in getAllEmbeddedDocs:", err.stack);
    return [];
  } finally {
    try {
      await client.close();
    } catch (closeErr) {
      console.error("Error closing MongoDB connection:", closeErr);
    }
  }
}

// Test function to verify the setup
export async function testConnection() {
  try {
    const docs = await getAllEmbeddedDocs(1);
    if (docs.length > 0) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    console.error("Connection test failed:", err.message);
    return false;
  }
}
