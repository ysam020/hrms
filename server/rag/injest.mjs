import { MongoClient } from "mongodb";
import { getEmbedding } from "./get-embeddings.mjs";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.ATLAS_CONNECTION_STRING);

  try {
    await client.connect();
    const db = client.db("hrms-dev");

    // Source collection (your existing data)
    const sourceCollection = db.collection("users");

    // Target collection (for RAG with embeddings)
    const ragCollection = db.collection("rag_embeddings");

    // Get total count for progress tracking
    const totalDocuments = await sourceCollection.countDocuments({});
    console.log(`Found ${totalDocuments} documents to process.`);

    console.log("Processing documents in batches...");

    const BATCH_SIZE = 10;
    let processed = 0;
    let totalInserted = 0;

    // Process documents in batches using cursor with field selection
    const cursor = sourceCollection.find(
      {},
      {
        projection: {
          username: 1,
          rank: 1,
          first_name: 1,
          middle_name: 1,
          last_name: 1,
          email: 1,
          dob: 1,
          blood_group: 1,
          official_email: 1,
          mobile: 1,
          communication_address_line_1: 1,
          communication_address_line_2: 1,
          communication_address_city: 1,
          communication_address_state: 1,
          communication_address_pincode: 1,
          permanent_address_line_1: 1,
          permanent_address_line_2: 1,
          permanent_address_city: 1,
          permanent_address_state: 1,
          permanent_address_pincode: 1,
          designation: 1,
          department: 1,
          joining_date: 1,
        },
      }
    );

    while (await cursor.hasNext()) {
      const batch = [];

      // Collect batch of documents
      for (let i = 0; i < BATCH_SIZE && (await cursor.hasNext()); i++) {
        batch.push(await cursor.next());
      }

      // Process current batch
      const insertDocuments = [];

      for (const doc of batch) {
        try {
          // Extract text to embed from the ACTUAL user fields
          const textToEmbed = [
            doc.username,
            doc.rank,
            doc.first_name,
            doc.middle_name,
            doc.last_name,
            doc.email,
            doc.official_email,
            doc.designation,
            doc.department,
            doc.communication_address_city,
            doc.communication_address_state,
            doc.permanent_address_city,
            doc.permanent_address_state,
            doc.blood_group,
          ]
            .filter(Boolean) // Remove null/undefined values
            .join(" ");

          // Only create chunks if we have text to embed
          if (!textToEmbed.trim()) {
            console.log(`Skipping document ${doc._id} - no text to embed`);
            continue;
          }

          // Split into chunks if text is long
          const chunks = splitTextIntoChunks(textToEmbed, 400, 20);

          // Generate embeddings for each chunk
          for (let i = 0; i < chunks.length; i++) {
            const embedding = await getEmbedding(chunks[i]);

            insertDocuments.push({
              originalId: doc._id,
              chunkIndex: i,
              totalChunks: chunks.length,
              content: chunks[i],
              embedding: embedding,
              metadata: {
                // Store the actual user data as metadata
                originalId: doc._id,
                username: doc.username,
                rank: doc.rank,
                first_name: doc.first_name,
                middle_name: doc.middle_name,
                last_name: doc.last_name,
                email: doc.email,
                dob: doc.dob,
                blood_group: doc.blood_group,
                mobile: doc.mobile,
                official_email: doc.official_email,
                designation: doc.designation,
                department: doc.department,
                joining_date: doc.joining_date,
              },
            });

            // Force garbage collection hint
            if (global.gc) {
              global.gc();
            }
          }
        } catch (error) {
          console.error(`Error processing document ${doc._id}:`, error.message);
          continue;
        }
      }

      // Insert batch if we have documents to insert
      if (insertDocuments.length > 0) {
        try {
          const options = { ordered: false };
          const result = await ragCollection.insertMany(
            insertDocuments,
            options
          );
          totalInserted += result.insertedCount;
          console.log(`Batch inserted: ${result.insertedCount} chunks`);
        } catch (insertError) {
          console.error("Error inserting batch:", insertError.message);
        }
      }

      processed += batch.length;
      console.log(
        `Progress: ${processed}/${totalDocuments} documents processed (${totalInserted} chunks inserted)`
      );

      // Clear arrays to free memory
      insertDocuments.length = 0;
      batch.length = 0;
    }

    console.log(
      `\nCompleted! Processed ${processed} documents and inserted ${totalInserted} chunks.`
    );
  } catch (err) {
    console.error("Fatal error:", err.stack);
  } finally {
    await client.close();
  }
}

// Helper function to split text into chunks
function splitTextIntoChunks(text, chunkSize = 400, overlap = 20) {
  if (!text || text.length <= chunkSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;

    if (start >= text.length) break;
  }

  return chunks;
}

run().catch(console.dir);
