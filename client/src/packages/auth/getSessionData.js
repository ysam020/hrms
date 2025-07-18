import apiClient from "../../config/axiosConfig";

export const getSessionData = async (setGeolocation, setLoading) => {
  setLoading(true);

  try {
    // Configure axios to receive response as text instead of JSON
    const res = await apiClient.get(`/get-session-data`, {
      transformResponse: [(data) => data], // Prevent axios from auto-parsing JSON
      responseType: "text", // Request text response
    });

    // Manually parse the JSON
    let parsedData;
    try {
      parsedData = JSON.parse(res.data);
      setGeolocation(parsedData.activeSessions || []);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Problem with this response:", res.data);
      // Log the character at position where error occurs
      if (res.data && typeof res.data === "string") {
        const errorPos = parseError.message.match(/column (\d+)/);
        if (errorPos && errorPos[1]) {
          const pos = parseInt(errorPos[1]);
          console.error(
            `Characters around error position (${pos}):`,
            res.data.substring(Math.max(0, pos - 20), pos) +
              "|ERROR HERE|" +
              res.data.substring(pos, Math.min(res.data.length, pos + 20))
          );
        }
      }
      setGeolocation([]);
    }
  } catch (error) {
    console.error("Network Error:", error);
    console.error("Error details:", error.response?.data || error.message);
    setGeolocation([]);
  } finally {
    setLoading(false);
  }
};
