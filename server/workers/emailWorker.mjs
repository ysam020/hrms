import { parentPort } from "worker_threads";
import { Worker } from "bullmq";
import Redis from "ioredis";
import transporter from "../utils/transporter.mjs";
import dotenv from "dotenv";

dotenv.config();

// Create Redis connection with BullMQ-specific options
const connection = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT ? process.env.REDIS_PORT : 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Create a worker to process email jobs
const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    const { to, subject, html } = job.data;

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM, // Sender email address
        to,
        subject,
        html,
      });

      parentPort?.postMessage(`Email sent successfully to ${to}`);
    } catch (err) {
      console.error("Error sending email with Nodemailer:", err);
      parentPort?.postMessage(`Failed to send email: ${err.message}`);
    }
  },
  { connection }
);

// Handle worker events
emailWorker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed with error: ${err.message}`);
  parentPort?.postMessage(`Job ${job.id} failed: ${err.message}`);
});
