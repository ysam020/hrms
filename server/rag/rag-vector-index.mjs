import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

// Connect to your Atlas cluster
const client = new MongoClient(process.env.ATLAS_CONNECTION_STRING);

async function run() {
  try {
    const database = client.db("hrms-dev");
    const collection = database.collection("rag_embeddings");

    // Define your Atlas Vector Search index
    const index = {
      name: "vector_index",
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            similarity: "cosine",
            numDimensions: 768,
          },
        ],
      },
    };

    // Call the method to create the index
    const result = await collection.createSearchIndex(index);
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
