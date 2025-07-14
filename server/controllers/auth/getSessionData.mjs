/**
 * @swagger
 * /api/get-session-data:
 *   get:
 *     summary: Retrieve active session data with geolocation information
 *     description: This endpoint fetches active sessions for the currently authenticated user, including geolocation details for each session.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved active session data with geolocation information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activeSessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "507f1f77bcf86cd799439011"
 *                       userId:
 *                         type: string
 *                         example: "507f1f77bcf86cd799439012"
 *                       userAgent:
 *                         type: string
 *                         example: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
 *                       createdAt:
 *                         type: string
 *                         example: "2024-11-09T12:34:56Z"
 *                       expiresAt:
 *                         type: string
 *                         example: "2024-11-10T12:34:56Z"
 *                       locationData:
 *                         type: object
 *                         properties:
 *                           locationError:
 *                             type: string
 *                             example: "Location permission denied"
 *                           road:
 *                             type: string
 *                             example: "Main Street"
 *                           normalizedCity:
 *                             type: string
 *                             example: "Los Angeles"
 *                           country:
 *                             type: string
 *                             example: "United States"
 *                           postcode:
 *                             type: string
 *                             example: "90001"
 *                           state:
 *                             type: string
 *                             example: "California"
 *                           stateDistrict:
 *                             type: string
 *                             example: "LA County"
 *                           suburb:
 *                             type: string
 *                             example: "Downtown"
 *                           village:
 *                             type: string
 *                             example: "N/A"
 *       401:
 *         description: Unauthorized request (user not authenticated).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized"
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 *     tags:
 *       - Authentication
 */

import mongoose from "mongoose";
import axios from "axios";

const getSessionData = async (req, res) => {
  try {
    const sessionStore = mongoose.connection.collection("sessions");

    // Fetch only session field
    const sessions = await sessionStore
      .find({}, { projection: { session: 1 } })
      .toArray();
    const currentTime = new Date();

    // Process sessions
    const parsedSessions = sessions
      .map((session) => {
        try {
          if (!session.session) return null;
          const parsedSession = JSON.parse(session.session);

          // Check if session is still valid
          const expiringAt = parsedSession.expiresAt
            ? new Date(parsedSession.expiresAt)
            : null;
          if (!expiringAt || expiringAt <= currentTime) return null;

          // Extract relevant data
          return {
            loginAt: parsedSession.loginAt || null,
            expiresAt: parsedSession.expiresAt || null,
            userAgent: parsedSession.userAgent || null,
            latitude: parsedSession.latitude
              ? parseFloat(parsedSession.latitude)
              : null,
            longitude: parsedSession.longitude
              ? parseFloat(parsedSession.longitude)
              : null,
          };
        } catch (error) {
          console.warn("Error parsing session:", error);
          return null;
        }
      })
      .filter(Boolean); // Remove null values

    // Function to get geolocation details
    const getGeoData = async (latitude, longitude) => {
      if (!latitude || !longitude || !process.env.OPENCAGE_API_KEY) return null;

      try {
        const response = await axios.get(
          `https://api.opencagedata.com/geocode/v1/json`,
          {
            params: {
              q: `${latitude},${longitude}`,
              key: process.env.OPENCAGE_API_KEY,
            },
          }
        );

        if (response.data.results.length > 0) {
          const { components } = response.data.results[0];
          return {
            road: components.road || null,
            normalizedCity: components._normalized_city || null,
            country: components.country || null,
            postcode: components.postcode || null,
            state: components.state || null,
            stateDistrict: components.state_district || null,
            suburb: components.suburb || null,
            village: components.village || null,
          };
        }
      } catch (error) {
        console.error("Error fetching geolocation data:", error);
      }
      return null;
    };

    // Enhance sessions with geolocation
    const enhancedSessions = await Promise.all(
      parsedSessions.map(async (session) => {
        const { latitude, longitude } = session;
        const geoData =
          latitude && longitude
            ? await getGeoData(latitude, longitude)
            : { locationError: "Location permission denied" };

        return { ...session, ...geoData };
      })
    );

    // Send response
    res.json({ activeSessions: enhancedSessions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default getSessionData;
