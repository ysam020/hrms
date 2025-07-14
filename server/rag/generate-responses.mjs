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
    // Retrieve relevant documents from vector search
    const documents = await getQueryResults(userQuery);

    if (documents.length === 0) {
      console.error("No relevant documents found in the database.");
      return "I couldn't find any relevant information in the user database for your query.";
    }

    // Get only the document with the highest score (first one, as they're sorted by score)
    const bestMatch = documents[0];

    // Build context from only the highest scoring document
    let contextText = "";

    contextText += `Best Match Document:\n`;
    contextText += `Content: ${bestMatch.content}\n`;

    if (bestMatch.metadata) {
      contextText += `User Details:\n`;
      if (bestMatch.metadata.username)
        contextText += `- Username: ${bestMatch.metadata.username}\n`;
      if (bestMatch.metadata.first_name)
        contextText += `- First Name: ${bestMatch.metadata.first_name}\n`;
      if (bestMatch.metadata.last_name)
        contextText += `- Last Name: ${bestMatch.metadata.last_name}\n`;
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

    // Create a comprehensive prompt for the LLM
    const prompt = `You are a helpful HR assistant with access to employee database information. Based on the retrieved user data below (which is the best match from our database), please answer the user's question accurately and professionally.

User Question: "${userQuery}"

Best Match Employee Data:
${contextText}

Instructions:
- Answer based only on the provided employee data (this is the most relevant match)
- Be specific and mention relevant details like names, designations, departments, etc.
- Provide relevant information about this employee in a conversational format
- If the data is insufficient to fully answer the question, mention what information is available
- Do NOT format your response as an email
- Do NOT include email signatures, greetings like "Dear", or closing statements like "Best regards"
- Do NOT include placeholders like [Your Name] or [Your Position]
- Just provide a direct, informative response about the employee
- Keep it but casual and not professional
- Do not include any disclaimers or additional context outside the employee data
- Focus on the most relevant information from the retrieved data
- If the question is about a specific employee, ensure you mention their name and details
- If the question is about a match, provide only the relevant details about that match
- Do not include any personal opinions or assumptions
- Do not format the response as an email or include any email-like structure

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
            "You are a helpful HR assistant that provides information about employees based on database records. Always be accurate, professional, and conversational. Never format responses as emails or include email signatures.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 300,
      temperature: 0.2, // Lower temperature for more factual responses
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
  const result = await queryUserWithRAG(query);
  return result;
}

// singleQuery().catch(console.dir);
