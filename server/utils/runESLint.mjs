import { exec } from "child_process";
import util from "util";
import transporter from "./transporter.mjs";
import dotenv from "dotenv";

dotenv.config();

const execPromise = util.promisify(exec);

// Function to run ESLint and send logs via email
const runESLint = async () => {
  try {
    const { stdout, stderr } = await execPromise("npm run lint");

    const logs = stdout.trim() || stderr.trim();

    // Don't send an email if no logs exist
    if (
      !logs ||
      logs.includes("No issues found.") ||
      logs.endsWith("> eslint .")
    ) {
      return;
    }

    await sendEmail(logs);
  } catch (error) {
    // Capture full error output (if ESLint fails)
    const logs =
      error.stdout?.trim() ||
      error.stderr?.trim() ||
      `Error running ESLint:\n${error.message}`;

    if (logs) {
      await sendEmail(logs);
    }
  }
};

// Function to send email
const sendEmail = async (logData) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.DEV_EMAIL,
      subject: "Daily ESLint Report",
      text: logData, // Send logs as text
    });
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

export default runESLint;
