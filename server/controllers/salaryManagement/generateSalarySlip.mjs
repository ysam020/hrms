import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import numberToWords from "number-to-words";
import UserModel from "../../model/userModel.mjs";
import aesDecrypt from "../../utils/aesDecrypt.mjs";
import getAttendanceSummary from "../../utils/getAttendanceSummary.mjs";
import salaryStructureModel from "../../model/salaryStructureModel.mjs";
import { MONTHS } from "../../assets/months.mjs";

const PDF_CONFIG = {
  format: "a4",
  orientation: "p",
  unit: "mm",
  margins: { left: 15, right: 15 },
  fonts: {
    main: "helvetica",
    sizes: { title: 14, subtitle: 12, normal: 10, small: 8, table: 9 },
  },
};

const COMPANY_INFO = {
  name: "Paymaster Management Solutions Limited",
  address: [
    "Address :- A-wing, 2nd Floor, Maradia Plaza,",
    "CG Road, Ahmedabad-380006, Gujarat",
  ],
};

// Helper Functions
function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function getMonthName(month) {
  return MONTHS[month - 1];
}

function calculatePaidDays(attendanceData) {
  const { presents, halfDays, holidays, paidLeaves } = attendanceData;
  return presents + 0.5 * halfDays + holidays + paidLeaves;
}

function calculateGrossDeductions(salaryStructure) {
  const { pf = 0, esi = 0, pt = 0 } = salaryStructure;
  return pf + esi + pt;
}

function calculateGrossEarnings(salaryComponents) {
  const { basicPay, hra, conveyance = 0, incentive = 0 } = salaryComponents;
  return basicPay + hra + conveyance + incentive;
}

// Data Processing Functions
async function fetchUserData(username) {
  const user = await UserModel.findOne({ username });
  if (!user) throw new Error(`User not found: ${username}`);

  return {
    fullName: user.getFullName(),
    username: user.username,
    joiningDate: user.joining_date,
    department: user.department,
    designation: user.designation,
    salaryStructure: user.salaryStructure,
    // Decrypt sensitive data
    panNo: user.pan_no ? aesDecrypt(user.pan_no) : null,
    pfNo: user.pf_no ? aesDecrypt(user.pf_no) : null,
    uanNo: user.uan_no ? aesDecrypt(user.uan_no) : null,
    esicNo: user.esic_no ? aesDecrypt(user.esic_no) : null,
  };
}

async function fetchSalaryData(username, year, month) {
  const userSalary = await salaryStructureModel.findOne({
    username,
    year,
    month,
  });

  if (!userSalary) throw new Error(`Salary data not found for ${username}`);
  return userSalary.salaryStructure;
}

async function fetchAttendanceData(username, year, month) {
  return await getAttendanceSummary(username, year, month);
}

function prepareEmployeeData(userData, monthDays, paidDays, lossOfPay) {
  return {
    empCode: userData.username,
    empName: userData.fullName,
    dateOfJoining: userData.joiningDate,
    department: userData.department,
    designation: userData.designation,
    pfNo: userData.pfNo,
    uanNo: userData.uanNo,
    panNo: userData.panNo,
    esicNo: userData.esicNo,
    monthDays,
    paidDays,
    lossOfPay,
  };
}

// PDF Generation Functions
function initializePDF() {
  const doc = new jsPDF(
    PDF_CONFIG.orientation,
    PDF_CONFIG.unit,
    PDF_CONFIG.format
  );
  doc.setFont(PDF_CONFIG.fonts.main);
  return doc;
}

function addCompanyHeader(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  // Company name
  doc.setFontSize(PDF_CONFIG.fonts.sizes.title);
  doc.setFont(PDF_CONFIG.fonts.main, "bold");
  doc.text(COMPANY_INFO.name, centerX, 20, { align: "center" });

  // Company address
  doc.setFontSize(PDF_CONFIG.fonts.sizes.normal);
  doc.setFont(PDF_CONFIG.fonts.main, "normal");
  doc.text(COMPANY_INFO.address[0], centerX, 28, { align: "center" });
  doc.text(COMPANY_INFO.address[1], centerX, 33, { align: "center" });
}

function addSalarySlipTitle(doc, monthName, year, monthDays) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  // Title
  doc.setFontSize(PDF_CONFIG.fonts.sizes.subtitle);
  doc.setFont(PDF_CONFIG.fonts.main, "bold");
  doc.text(`Salary Slip for the Month ${monthName}-${year}`, centerX, 45, {
    align: "center",
  });

  // Period
  doc.setFontSize(PDF_CONFIG.fonts.sizes.normal);
  const monthAbbr = monthName.substring(0, 3);
  doc.text(
    `( From 01 - ${monthAbbr} - ${year} To ${monthDays} - ${monthAbbr} - ${year})`,
    centerX,
    50,
    { align: "center" }
  );
}

function createEmployeeDetailsTable(employeeData) {
  return [
    [
      "Employee Code",
      employeeData.empCode,
      "UAN No",
      employeeData.uanNo || "N/A",
      "Month Days",
      employeeData.monthDays.toString(),
    ],
    [
      "Employee Name",
      employeeData.empName,
      "PF No",
      employeeData.pfNo || "N/A",
      "Paid Days",
      employeeData.paidDays.toString(),
    ],
    [
      "Date Of Joining",
      employeeData.dateOfJoining,
      "PAN No",
      employeeData.panNo,
      "Loss of Pay",
      employeeData.lossOfPay.toString(),
    ],
    [
      "Department",
      employeeData.department,
      "ESIC NO",
      employeeData.esicNo || "N/A",
      "",
      "",
    ],
    ["Designation", employeeData.designation, "", "", "", ""],
  ];
}

function createEarningsDeductionsTable(
  salaryComponents,
  earnedSalary,
  grossDeductions
) {
  const grossEarnings = calculateGrossEarnings(salaryComponents);

  return [
    [
      {
        content: "Earning Heads",
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
      {
        content: "Fixed Rate",
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
      {
        content: "Earnings",
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
      {
        content: "Deduction Heads",
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
      {
        content: "Deductions",
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
    ],
    [
      "BASIC",
      salaryComponents.basicPay.toString(),
      earnedSalary.basicPay.toString(),
      "PF",
      earnedSalary.pf.toString(),
    ],
    [
      "HRA",
      salaryComponents.hra.toString(),
      earnedSalary.hra.toString(),
      "ESI",
      earnedSalary.esi.toString(),
    ],
    [
      "CONVEYANCE",
      (salaryComponents.conveyance || 0).toString(),
      earnedSalary.conveyance.toString(),
      "PT",
      earnedSalary.pt.toString(),
    ],
    [
      "INCENTIVE",
      (salaryComponents.incentive || 0).toString(),
      earnedSalary.incentive.toString(),
      "DEDUCTIONS",
      "",
    ],
    [
      {
        content: "Gross Earning",
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
      {
        content: grossEarnings.toString(),
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
      {
        content: earnedSalary.grossEarnings.toString(),
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
      {
        content: "Gross Deductions",
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
      {
        content: grossDeductions.toString(),
        styles: { fontStyle: "bold", fillColor: [240, 240, 240] },
      },
    ],
  ];
}

function addEmployeeDetailsTable(doc, employeeData) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth =
    pageWidth - PDF_CONFIG.margins.left - PDF_CONFIG.margins.right;

  const tableData = createEmployeeDetailsTable(employeeData);

  autoTable(doc, {
    startY: 60,
    body: tableData,
    theme: "grid",
    styles: {
      fontSize: PDF_CONFIG.fonts.sizes.small,
      cellPadding: 2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [240, 240, 240] },
      2: { fontStyle: "bold", fillColor: [240, 240, 240] },
      4: { fontStyle: "bold", fillColor: [240, 240, 240] },
    },
    tableWidth,
    margin: { left: PDF_CONFIG.margins.left, right: PDF_CONFIG.margins.right },
  });
}

function addEarningsDeductionsTable(
  doc,
  salaryComponents,
  earnedSalary,
  grossDeductions
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth =
    pageWidth - PDF_CONFIG.margins.left - PDF_CONFIG.margins.right;

  const tableData = createEarningsDeductionsTable(
    salaryComponents,
    earnedSalary,
    grossDeductions
  );
  const previousTable = doc.previousAutoTable || { finalY: 100 };
  const startY = previousTable.finalY + 5;

  autoTable(doc, {
    startY,
    body: tableData,
    theme: "grid",
    styles: {
      fontSize: PDF_CONFIG.fonts.sizes.table,
      cellPadding: 3,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      halign: "center",
    },
    columnStyles: {
      0: { halign: "left" },
      3: { halign: "left" },
    },
    tableWidth,
    margin: { left: PDF_CONFIG.margins.left, right: PDF_CONFIG.margins.right },
  });
}

function convertAmountToWords(amount) {
  // Handle decimal places properly
  const parts = amount.toString().split(".");
  const wholePart = parseInt(parts[0]);
  const decimalPart = parts[1]
    ? parseInt(parts[1].padEnd(2, "0").substring(0, 2))
    : 0;

  let result = numberToWords.toWords(wholePart);

  // Remove hyphens
  result = result.replace(/-/g, " ");

  // Capitalize first letter
  result = result.charAt(0).toUpperCase() + result.slice(1);

  // Add rupees
  result += " rupees";

  // Add decimal part if exists
  if (decimalPart > 0) {
    let paiseInWords = numberToWords.toWords(decimalPart);
    // Remove hyphens from paise as well
    paiseInWords = paiseInWords.replace(/-/g, " ");
    result += ` and ${paiseInWords} paise`;
  }

  return `${result} only`;
}

function addNetPayableSection(doc, netPayable) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth =
    pageWidth - PDF_CONFIG.margins.left - PDF_CONFIG.margins.right;
  const netPayableY = (doc.previousAutoTable?.finalY || 160) + 14;

  const amountInWords = convertAmountToWords(netPayable);

  autoTable(doc, {
    startY: netPayableY,
    body: [
      [
        {
          content: "Net Payable",
          styles: {
            fontStyle: "bold",
            fillColor: [240, 240, 240],
            fontSize: 12,
          },
        },
        {
          content: netPayable.toString(),
          styles: {
            fontStyle: "bold",
            fillColor: [240, 240, 240],
            fontSize: 12,
          },
        },
        {
          content: `In Words: ${amountInWords}`,
          styles: {
            fontStyle: "bold",
            fillColor: [240, 240, 240],
            fontSize: 10,
          },
        },
      ],
    ],
    theme: "grid",
    styles: {
      cellPadding: 5,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      halign: "center",
    },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "left" },
      2: { halign: "left" },
    },
    tableWidth,
    margin: { left: PDF_CONFIG.margins.left, right: PDF_CONFIG.margins.right },
  });
}

function addFooter(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const footerY = (doc.previousAutoTable?.finalY || 200) + 30;

  doc.setFontSize(PDF_CONFIG.fonts.sizes.small);
  doc.setFont(PDF_CONFIG.fonts.main, "italic");
  doc.text(
    "*THIS IS COMPUTER GENERATED PAYMENT SLIP NO SIGNATURE IS REQUIRED",
    centerX,
    footerY,
    { align: "center" }
  );
}

// Updated function to send PDF instead of saving
function sendPDFToClient(doc, res, filename, employeeName, monthName, year) {
  // Generate the PDF buffer
  const pdfBuffer = doc.output("arraybuffer");

  // Create a proper filename
  const sanitizedEmployeeName = employeeName.replace(/[^a-zA-Z0-9]/g, "_");
  const pdfFilename =
    filename || `salary_slip_${sanitizedEmployeeName}_${monthName}_${year}.pdf`;

  // Set response headers for PDF download
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
  res.setHeader("Content-Length", pdfBuffer.byteLength);

  // Send the PDF buffer to client
  res.send(Buffer.from(pdfBuffer));
}

// Main function
const generateSalarySlip = async (req, res, next) => {
  try {
    // Extract and validate parameters
    const { username, year, month } = req.params;
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    if (!username || !monthNum || !yearNum) {
      throw new Error("Invalid parameters provided");
    }

    // Calculate basic date information
    const monthDays = getDaysInMonth(monthNum, yearNum);
    const monthName = getMonthName(monthNum);

    // Fetch all required data
    const [userData, salaryData, attendanceData] = await Promise.all([
      fetchUserData(username),
      fetchSalaryData(username, yearNum, monthNum),
      fetchAttendanceData(username, yearNum, monthNum),
    ]);

    // Calculate derived values
    const paidDays = calculatePaidDays(attendanceData);
    const lossOfPay = monthDays - paidDays;
    const grossDeductions = calculateGrossDeductions(salaryData);

    // Prepare employee data
    const employeeData = prepareEmployeeData(
      userData,
      monthDays,
      paidDays,
      lossOfPay
    );

    // Generate PDF
    const doc = initializePDF();

    // Add PDF sections
    addCompanyHeader(doc);
    addSalarySlipTitle(doc, monthName, yearNum, monthDays);
    addEmployeeDetailsTable(doc, employeeData);
    addEarningsDeductionsTable(
      doc,
      userData.salaryStructure,
      salaryData,
      grossDeductions
    );
    addNetPayableSection(doc, salaryData.netPayable);
    addFooter(doc);

    // Send PDF to client for download instead of saving
    sendPDFToClient(doc, res, null, userData.fullName, monthName, yearNum);
  } catch (err) {
    console.error("Error generating salary slip:", err);
    next(err);
  }
};

export default generateSalarySlip;
