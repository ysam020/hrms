import mongoose from "mongoose";
import haversine from "haversine-distance";
import axios from "axios";
import { emailQueue } from "../../config/queueConfig.mjs";
import { unusualLoginTemplate } from "../../templates/unusualLoginTemplate.mjs";

export const unusualLoginDetection = async (req, res) => {
  const userId = req.user.id;
  const { geolocation } = req.body;

  try {
    const isFraudulentLogin = async (loginAt, latitude, longitude, userId) => {
      try {
        const SessionModel = mongoose.connection.db.collection("sessions");

        // Fetch all sessions for the given user
        const sessions = await SessionModel.find({}).toArray();

        const userSessions = sessions
          .map((s) => {
            try {
              const sessionData = JSON.parse(s.session);
              if (sessionData.passport?.user !== userId) return null;
              return {
                loginAt: new Date(sessionData.loginAt),
                latitude: sessionData.latitude,
                longitude: sessionData.longitude,
              };
            } catch (err) {
              console.error("Error parsing session:", err);
              return null;
            }
          })
          .filter(Boolean);

        if (userSessions.length === 0) return "Normal login"; // No previous sessions

        // Step 1: Analyze Usual Locations
        const usualLocations = userSessions.reduce((acc, session) => {
          const key = `${session.latitude},${session.longitude}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});

        const mostFrequentLocations = Object.entries(usualLocations)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([location]) => {
            const [lat, lon] = location.split(",").map(Number);
            return { latitude: lat, longitude: lon };
          });

        const fraudByLocation = !mostFrequentLocations.some((loc) => {
          const distance = haversine(
            { latitude: loc.latitude, longitude: loc.longitude },
            { latitude, longitude }
          );
          return distance < 50_000; // 50 km threshold
        });

        // Step 2: Analyze Usual Login Hours
        const latestHour = new Date(loginAt).getHours();
        const fraudByTime = latestHour < 7 || latestHour > 20;

        // Step 3: Combine Fraud Detection Logic
        if (fraudByLocation || fraudByTime) {
          let locationDetails = {};

          // Fetch location details from OpenCage API
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
            locationDetails = {
              city: components._normalized_city || "Unknown City",
              state: components.state || "Unknown State",
              country: components.country || "Unknown Country",
            };
          }

          // Construct location string for the email
          const locationString = `${locationDetails.city}, ${locationDetails.state}, ${locationDetails.country}`;

          const formattedTime = new Date(loginAt).toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false, // Ensure 24-hour format
          });

          const html = unusualLoginTemplate(
            req.user.username,
            formattedTime,
            locationString
          );

          // Send warning email using Nodemailer
          await emailQueue.add(
            "send-mail",
            {
              from: process.env.EMAIL_FROM, // Sender email address (configured in .env)
              to: req.user.email, // Recipient email address
              subject: "Login Attempt Warning",
              html: html, // The email HTML template content
            },
            {
              attempts: 2, // Number of retry attempts if job fails
              backoff: {
                type: "exponential",
                delay: 1000, // 1 second initial delay
              },
            }
          );

          return "Fraudulent login detected";
        }

        return "Normal login";
      } catch (error) {
        console.error("Fraud detection error:", error);
        return "Error checking fraud";
      }
    };

    const result = await isFraudulentLogin(
      new Date(),
      geolocation.latitude,
      geolocation.longitude,
      userId
    );

    res.status(200).send({ result });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};
export default unusualLoginDetection;
