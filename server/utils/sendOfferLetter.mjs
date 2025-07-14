import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import transporter from "./transporter.mjs";
import { hiringTemplate } from "../templates/hiringTemplate.mjs";

dotenv.config();

function formatIndianRupees(amount) {
  const numStr = amount.toString();
  if (numStr.length <= 3) return numStr;

  const [integerPart, decimalPart] = numStr.split(".");
  let lastThree = integerPart.slice(-3);
  let remaining = integerPart.slice(0, -3);

  if (remaining) {
    lastThree = "," + lastThree;
    remaining = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  }

  let formattedNumber = remaining + lastThree;
  if (decimalPart) formattedNumber += "." + decimalPart;

  return formattedNumber;
}

function formatDateToFullMonthYear(dateStr) {
  const date = new Date(dateStr);
  // Ensure the date is valid
  if (Number.isNaN(date)) {
    throw new Error("Invalid date format");
  }

  const day = date.getDate();
  const month = date.toLocaleString("en-IN", { month: "long" });
  const year = date.getFullYear(); // Get the full 4-digit year
  return `${day} ${month}, ${year}`;
}

export async function sendOfferLetter(
  name,
  email,
  designation,
  salary,
  joiningDate
) {
  try {
    const currentDir = process.cwd();
    const templatePath = path.join(currentDir, "assets", "Offer Letter.docx");
    const content = await fs.readFile(templatePath, "binary");

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const formattedSalary = formatIndianRupees(salary);
    const formattedJoiningDate = formatDateToFullMonthYear(joiningDate);

    doc.render({
      name,
      designation,
      salary: formattedSalary,
      joining_date: formattedJoiningDate,
    });

    const buf = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // Email sending logic
    const sanitizedName = name.replace(/\s+/g, "_").toLowerCase();
    const fileName = `${sanitizedName}_offer_letter_${Date.now()}.docx`;

    const html = hiringTemplate(name, formattedJoiningDate);

    // Send email with attachment
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Offer Letter for ${name}`,
      html,
      attachments: [
        {
          filename: fileName,
          content: buf,
        },
      ],
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(
        "Template file not found. Please check if 'Offer Letter.docx' exists in the assets folder"
      );
    } else {
      console.error("Error generating or sending offer letter:", error);
    }
    throw error;
  }
}
