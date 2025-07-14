import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";

// Helper function to add text with proper wrapping
const addText = (doc, text, x, y, options = {}) => {
  const {
    fontSize = 11,
    fontStyle = "normal",
    maxWidth = doc.internal.pageSize.width - 40,
    lineHeight = 5,
  } = options;

  doc.setFontSize(fontSize);
  doc.setFont("helvetica", fontStyle);

  if (maxWidth && text.length > 0) {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
  } else {
    doc.text(text, x, y);
    return y + lineHeight;
  }
};

// Helper function to check if new page is needed and handle page breaks properly
const checkPageBreak = (doc, currentY, requiredSpace = 25) => {
  if (currentY + requiredSpace > doc.internal.pageSize.height - 30) {
    doc.addPage();
    return 30; // Start from top margin on new page
  }
  return currentY;
};

// Helper function to add logo
const addLogo = (doc, logoPath) => {
  try {
    if (fs.existsSync(logoPath)) {
      const logoData = fs.readFileSync(logoPath);
      const logoBase64 = `data:image/png;base64,${logoData.toString("base64")}`;
      doc.addImage(logoBase64, "PNG", 20, 15, 100, 50);
    } else {
      // Fallback to placeholder if logo not found
      doc.setFillColor(220, 220, 220);
      doc.rect(20, 15, 100, 20, "F");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("COMPANY LOGO", 22, 28);
      doc.setTextColor(0, 0, 0);
    }
  } catch (error) {
    console.warn("Could not load logo, using placeholder:", error.message);
    // Fallback to placeholder
    doc.setFillColor(220, 220, 220);
    doc.rect(20, 15, 100, 20, "F");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("COMPANY LOGO", 22, 28);
    doc.setTextColor(0, 0, 0);
  }
};

// Main function to generate offer letter
const generateOfferLetter = (candidateData, logoPath = "./assets/logo.png") => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let currentY = 30;

  // Add Company Logo
  addLogo(doc, logoPath);
  currentY = 70;

  // Greeting
  currentY = addText(doc, `Dear ${candidateData.name}`, 20, currentY, {
    fontSize: 12,
    fontStyle: "normal",
  });
  currentY += 6;

  // Opening paragraph
  const openingText = `We are absolutely thrilled to extend to you a job offer for the position of ${candidateData.designation} at PAYMASTER MANAGEMENT SOLUTIONS LIMITED. Your expertise and enthusiasm align perfectly with what we're looking for, and we can't wait to have you on board.`;
  currentY = addText(doc, openingText, 20, currentY, { fontSize: 11 });
  currentY += 6;

  // Journey begins paragraph
  const journeyText = `Your journey with us begins on ${candidateData.joiningDate}. You'll kick things off with a probationary period of six months, during which you'll get a feel for the company and the role.`;
  currentY = addText(doc, journeyText, 20, currentY, { fontSize: 11 });
  currentY += 6;

  // CTC paragraph
  const ctcText = `Your total CTC package for this role will be Rs. ${candidateData.salary}/-, which includes all the fantastic benefits, allowances, and perks outlined in our company policy. The breakup of CTC is in Annexure 1`;
  currentY = addText(doc, ctcText, 20, currentY, { fontSize: 11 });
  currentY += 6;

  // Official acceptance paragraph
  const acceptanceText = `To make it official, we kindly ask for your written/over email, acceptance of this offer letter. We also look forward to seeing you bright and early at PAYMASTER MANAGEMENT SOLUTIONS LIMITED on ${candidateData.joiningDate}, at 10 am, to kick off your exciting journey with us.`;
  currentY = addText(doc, acceptanceText, 20, currentY, { fontSize: 11 });
  currentY += 6;

  // Questions paragraph
  const questionsText = `If you have any questions, thoughts, or concerns regarding this offer or anything else related to your role, don't hesitate to get in touch with us. We're here to ensure your transition is as smooth and enjoyable as possible.`;
  currentY = addText(doc, questionsText, 20, currentY, { fontSize: 11 });
  currentY += 6;

  // Welcome paragraph
  const welcomeText = `Once again, welcome to the PAYMASTER MANAGEMENT SOLUTIONS LIMITED family! We can't wait to embark on this journey together.`;
  currentY = addText(doc, welcomeText, 20, currentY, { fontSize: 11 });
  currentY += 8;

  // Signature
  currentY = addText(
    doc,
    "Mr. xxxxxxxx (PAYMASTER MANAGEMENT SOLUTIONS LIMITED)",
    20,
    currentY,
    { fontSize: 11 }
  );
  currentY += 12;

  // Check page break before Terms and Conditions
  currentY = checkPageBreak(doc, currentY, 60);

  // Terms and Conditions Header
  currentY = addText(doc, "Notable Terms and Conditions:", 20, currentY, {
    fontSize: 12,
    fontStyle: "bold",
  });
  currentY += 8;

  // 1. Probation Period
  currentY = checkPageBreak(doc, currentY, 35);
  currentY = addText(doc, "1. Probation Period:", 20, currentY, {
    fontSize: 11,
    fontStyle: "bold",
  });
  currentY += 6;

  currentY = addText(
    doc,
    "i) The employee will undergo a probationary period of Six months.",
    25,
    currentY,
    { fontSize: 11 }
  );
  currentY += 5;

  currentY = addText(
    doc,
    `ii) During the probation period, your salary will be Rs.${
      candidateData.probationSalary || "xxxxxxx"
    }.`,
    25,
    currentY,
    { fontSize: 11 }
  );
  currentY += 5;

  currentY = addText(
    doc,
    "iii) The lock-in period for this position will be one year.",
    25,
    currentY,
    { fontSize: 11 }
  );
  currentY += 8;

  // 2. Leave Policy
  currentY = checkPageBreak(doc, currentY, 25);
  currentY = addText(doc, "2. Leave Policy:", 20, currentY, {
    fontSize: 11,
    fontStyle: "bold",
  });
  currentY += 6;

  currentY = addText(
    doc,
    "Two leaves per month are allotted: one sick leave and one casual leave.",
    25,
    currentY,
    { fontSize: 11 }
  );
  currentY += 5;

  currentY = addText(
    doc,
    "Leaves are credited on a monthly basis and can be accumulated up to a maximum of 24 or as per policy.",
    25,
    currentY,
    { fontSize: 11 }
  );
  currentY += 8;

  // 3. Working Hours
  currentY = checkPageBreak(doc, currentY, 20);
  currentY = addText(doc, "3. Working Hours:", 20, currentY, {
    fontSize: 11,
    fontStyle: "bold",
  });
  currentY += 6;

  const workingHoursText =
    "Regular working hours are from 09:00 AM to 7:00 PM, all days or as per company's discretion.";
  currentY = addText(doc, workingHoursText, 25, currentY, { fontSize: 11 });
  currentY += 8;

  // 4. Responsibilities
  currentY = checkPageBreak(doc, currentY, 25);
  currentY = addText(doc, "4. Responsibilities", 20, currentY, {
    fontSize: 11,
    fontStyle: "bold",
  });
  currentY += 6;

  const responsibilities = [
    "Curriculum Development Oversight: Spearhead the design and refinement of a robust Collections curriculum, meticulously aligning course content with the latest standards and proficiency levels.",
    "Pedagogical Leadership: Demonstrate instructional excellence by delivering dynamic and tailored Collections strategy, employing a diverse range of methodologies to optimise your engagement and comprehension.",
    "Comprehensive Assessment Management: Implement systematic assessment strategies to evaluate your progress accurately, providing timely and constructive feedback to facilitate continuous improvement and attainment of target scores.",
    "Continual Professional Advancement: Pursue ongoing professional development opportunities to remain at the forefront of Collections and assessment methodologies, integrating emerging trends and best practices into instructional delivery.",
    "Collaborative Engagement: Foster a culture of collaboration within the team, actively participating in enhancement initiatives, and offering mentorship and support to colleagues to ensure program cohesion and effectiveness.",
  ];

  responsibilities.forEach((responsibility, index) => {
    // Check if we need a page break for each responsibility
    currentY = checkPageBreak(doc, currentY, 25);
    currentY = addText(doc, `${index + 1}. ${responsibility}`, 25, currentY, {
      fontSize: 11,
    });
    currentY += 6;
  });

  // Background check condition
  currentY = checkPageBreak(doc, currentY, 20);
  const backgroundCheckText =
    "4. This offer and your employment with PAYMASTER MANAGEMENT SOLUTIONS LIMITED. is contingent upon a satisfactory verification of a background check";
  currentY = addText(doc, backgroundCheckText, 20, currentY, { fontSize: 11 });
  currentY += 15;

  // Annexure II
  currentY = checkPageBreak(doc, currentY, 30);
  currentY = addText(doc, "Annexure II", 20, currentY, {
    fontSize: 12,
    fontStyle: "bold",
  });
  currentY += 6;

  currentY = addText(doc, "TABLE :", 20, currentY, {
    fontSize: 11,
    fontStyle: "bold",
  });
  currentY += 6;

  const documents = [
    "Educational certificates and Mark Sheets ·10th Standard mark sheet or equivalent certificate ·12th Standard mark sheet or equivalent certificate ·Graduation Standard mark sheet or equivalent certificate ·Post-Graduation Standard mark sheet or equivalent certificate ·Any other certification",
    "Experience/Relieving letters of your previous employers",
    "Last three months' salary slip of your last employer",
    "Aadhar Soft Copy",
    "Permanent and Current residence proof (Voter Card, Driving license etc.)",
    "Three passport size Photograph",
    "Last three months bank statement",
    "PAN Card",
  ];

  documents.forEach((document, index) => {
    currentY = checkPageBreak(doc, currentY, 18);
    currentY = addText(doc, `${index + 1}. ${document}`, 25, currentY, {
      fontSize: 11,
    });
    currentY += 6;
  });

  // Acceptance section
  currentY = checkPageBreak(doc, currentY, 40);
  currentY += 10;

  const acceptanceStatement = `I, ${candidateData.name}, agree to the above terms and conditions and sign here under acceptance of the same.`;
  currentY = addText(doc, acceptanceStatement, 20, currentY, { fontSize: 11 });
  currentY += 15;

  currentY = addText(doc, "Candidate's Signature", 20, currentY, {
    fontSize: 11,
    fontStyle: "bold",
  });

  return doc;
};

// Example usage function
const createOfferLetter = () => {
  const candidateData = {
    name: "John Doe",
    designation: "Senior Software Developer",
    joiningDate: "15th January 2024",
    salary: "8,50,000",
    probationSalary: "7,50,000",
  };

  // Path to logo - adjust as needed
  const logoPath = path.join(process.cwd(), "assets", "logo.png");

  const doc = generateOfferLetter(candidateData, logoPath);

  // Save the PDF
  const fileName = `offer_letter_${candidateData.name.replace(
    /\s+/g,
    "_"
  )}.pdf`;
  doc.save(fileName);

  // Or return the PDF as buffer for further processing
  return doc.output("arraybuffer");
};
createOfferLetter();
// Export functions for use in other modules
export { generateOfferLetter, createOfferLetter };

// Uncomment the line below to generate a sample offer letter when running the script directly
// createOfferLetter();
