import { singleQuery } from "../../rag/generate-responses.mjs";

const chatbot = async (req, res) => {
  try {
    // Validate request body
    if (!req.body) {
      return res.status(400).json({
        error: "Request body is required",
      });
    }

    const { message } = req.body;

    // Validate message parameter
    if (!message) {
      return res.status(400).json({
        error: "Message parameter is required",
      });
    }

    if (typeof message !== "string") {
      return res.status(400).json({
        error: "Message must be a string",
      });
    }

    if (message.trim() === "") {
      return res.status(400).json({
        error: "Message cannot be empty",
      });
    }

    // Process the query
    const response = await singleQuery(message);

    // Validate response
    if (!response) {
      return res.status(500).json({
        error: "No response generated",
      });
    }

    // Send successful response
    res.status(200).json({
      response: response,
      query: message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in chatbot endpoint:", error);

    // Send error response
    res.status(500).json({
      error:
        "An error occurred while processing your request. Please try again later.",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export default chatbot;
