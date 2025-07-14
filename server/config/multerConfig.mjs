import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const createUploadDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { folderName, username } = req.body;

    // Create path: uploads/kyc/username/ or uploads/folderName/username/
    const uploadPath = path.join(
      __dirname,
      "../uploads",
      folderName || "documents",
      username || "temp"
    );

    createUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp_originalname
    const timestamp = Date.now();
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${timestamp}_${sanitizedFilename}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Only images, PDFs, and Word documents are allowed.`
      ),
      false
    );
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// Middleware for handling multiple files with different field names
export const uploadKycFiles = upload.fields([
  { name: "employee_photo", maxCount: 1 },
  { name: "aadhar_photo_front", maxCount: 1 },
  { name: "aadhar_photo_back", maxCount: 1 },
  { name: "pan_photo", maxCount: 1 },
  { name: "education_certificates", maxCount: 10 },
  { name: "experience_certificate", maxCount: 1 },
  { name: "electricity_bill", maxCount: 1 },
  { name: "pcc", maxCount: 5 },
  { name: "dra_certificate", maxCount: 1 },
]);

// Single file upload middleware
export const uploadSingleFile = upload.single("file");

// Multiple files upload middleware
export const uploadMultipleFiles = upload.array("files", 10);

export default upload;
