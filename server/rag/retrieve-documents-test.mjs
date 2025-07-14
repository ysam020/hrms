import { getQueryResults } from "./retrieve-documents.mjs";
import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";
dotenv.config();

// Suppress HuggingFace provider selection logs
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

function suppressHFLogs() {
  console.log = (...args) => {
    const message = args.join(" ");
    // Filter out HuggingFace provider messages
    if (
      message.includes("Defaulting to") ||
      message.includes("Auto selected provider") ||
      message.includes("provider available for the model")
    ) {
      return;
    }
    originalConsoleLog(...args);
  };

  console.warn = (...args) => {
    const message = args.join(" ");
    // Filter out HuggingFace provider warnings
    if (
      message.includes("Defaulting to") ||
      message.includes("Auto selected provider") ||
      message.includes("provider available for the model")
    ) {
      return;
    }
    originalConsoleWarn(...args);
  };
}

function restoreConsoleLogs() {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
}

async function queryUserWithRAG(userQuery) {
  try {
    // Validate input
    if (
      !userQuery ||
      typeof userQuery !== "string" ||
      userQuery.trim() === ""
    ) {
      console.error("Invalid or empty query provided");
      return "Please provide a valid query.";
    }

    console.log(`Processing query: "${userQuery}"`);

    // Retrieve relevant documents from vector search
    const documents = await getQueryResults(userQuery);

    // Check if documents is null/undefined or empty
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      console.error("No relevant documents found in the database.");
      return "I couldn't find any relevant information in the user database for your query.";
    }

    console.log(`Found ${documents.length} documents`);

    // Get only the document with the highest score (first one, as they're sorted by score)
    const bestMatch = documents[0];

    if (!bestMatch) {
      console.error("Best match is null or undefined");
      return "No matching document found.";
    }

    console.log(`Best match score: ${bestMatch.score?.toFixed(4) || "N/A"}`);

    // Build context from only the highest scoring document
    let contextText = "";

    contextText += `Best Match Document:\n`;
    contextText += `Content: ${bestMatch.content || "No content available"}\n`;

    if (bestMatch.metadata) {
      contextText += `User Details:\n`;
      if (bestMatch.metadata.username)
        contextText += `- Username: ${bestMatch.metadata.username}\n`;
      if (bestMatch.metadata.first_name)
        contextText += `- First Name: ${bestMatch.metadata.first_name}\n`;
      if (bestMatch.metadata.last_name)
        contextText += `- Last Name: ${bestMatch.metadata.last_name}\n`;
      if (bestMatch.metadata.dob)
        contextText += `- Date of Birth: ${bestMatch.metadata.dob}\n`;
      if (bestMatch.metadata.email)
        contextText += `- Email: ${bestMatch.metadata.email}\n`;
      if (bestMatch.metadata.official_email)
        contextText += `- Official Email: ${bestMatch.metadata.official_email}\n`;
      if (bestMatch.metadata.designation)
        contextText += `- Designation: ${bestMatch.metadata.designation}\n`;
      if (bestMatch.metadata.department)
        contextText += `- Department: ${bestMatch.metadata.department}\n`;
      if (bestMatch.metadata.rank)
        contextText += `- Rank: ${bestMatch.metadata.rank}\n`;
      if (bestMatch.metadata.joining_date)
        contextText += `- Joining Date: ${bestMatch.metadata.joining_date}\n`;
      if (bestMatch.metadata.communication_address_city)
        contextText += `- Communication City: ${bestMatch.metadata.communication_address_city}\n`;
      if (bestMatch.metadata.communication_address_state)
        contextText += `- Communication State: ${bestMatch.metadata.communication_address_state}\n`;
      if (bestMatch.metadata.permanent_address_city)
        contextText += `- Permanent City: ${bestMatch.metadata.permanent_address_city}\n`;
      if (bestMatch.metadata.permanent_address_state)
        contextText += `- Permanent State: ${bestMatch.metadata.permanent_address_state}\n`;
    }
    contextText += `Similarity Score: ${
      bestMatch.score?.toFixed(4) || "N/A"
    }\n\n`;

    // Create a focused prompt for the LLM
    const prompt = `You are an HR assistant. Answer the specific question asked about the employee. Be direct and concise.

User Question: "${userQuery}"

Employee Data:
${contextText}

Instructions:
- Answer ONLY the specific question asked
- Be direct and concise
- If the requested information is not available in the data, simply say "The information is not available in the database"
- Do NOT provide additional information that wasn't asked for
- Do NOT use email format, signatures, or greetings
- Do NOT include phrases like "feel free to ask" or "if you need more information"
- Just give a direct answer to the question

Answer:`;

    // Suppress HuggingFace logs before making the API call
    suppressHFLogs();

    // Connect to Hugging Face
    const hf = new HfInference(process.env.HUGGING_FACE_ACCESS_TOKEN);

    // Use the chat completion endpoint
    const response = await hf.chatCompletion({
      model: "mistralai/Mistral-7B-Instruct-v0.3",
      messages: [
        {
          role: "system",
          content:
            "You are an HR assistant that answers specific questions about employees. Always be direct, concise, and answer only what is asked. Never provide extra information or use email formatting.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 100,
      temperature: 0.1, // Very low temperature for consistent, direct responses
    });

    // Restore console logs after API call
    restoreConsoleLogs();

    const answer = response.choices[0].message.content;
    return answer;
  } catch (err) {
    // Restore console logs in case of error
    restoreConsoleLogs();
    console.error("Error in queryUserWithRAG:", err.stack);
    return "I encountered an error while processing your request. Please try again.";
  }
}

// Single query function for direct use
export async function singleQuery(query) {
  // Validate input before processing
  if (!query || typeof query !== "string" || query.trim() === "") {
    console.error("Invalid query provided to singleQuery");
    return "Please provide a valid query.";
  }

  const result = await queryUserWithRAG(query);
  console.log("FINAL ANSWER:");
  console.log(result);
  return result; // Return the result for API use
}

// Export the main function as well
export { queryUserWithRAG };
