import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderName = req.query.folderName || "uploads";
    const username = req.query.username || "unknown";

    const currentDate = new Date().toISOString().split("T")[0];

    const uploadPath = path.join(
      __dirname,
      "../../uploads",
      folderName,
      username,
      currentDate
    );

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    const originalNameWithoutExt = path.basename(file.originalname, extension);
    const filename = `${originalNameWithoutExt}-${timestamp}${extension}`;
    cb(null, filename);
  },
});

// File filter for security
const fileFilter = (req, file, cb) => {
  // Allow images and PDFs
  const allowedTypes = /jpeg|jpg|png|gif|pdf/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only images and PDF files are allowed!"));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// File upload endpoint
router.post(
  "/api/upload-file",
  isAuthenticated,
  upload.single("file"),
  (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "No file uploaded",
        });
      }

      // Construct file URL with organized path
      const protocol = req.app.get("useHttps") ? "https" : "http";
      const host = req.get("host");
      const folderName = req.body.folderName || "uploads";
      const username = req.body.username || "unknown";
      const currentDate = new Date().toISOString().split("T")[0];
      const fileUrl = `${protocol}://${host}/uploads/${folderName}/${username}/${currentDate}/${req.file.filename}`;

      res.json({
        message: "File uploaded successfully",
        fileUrl: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Error handling middleware for multer - FIXED: Added 'next' parameter
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "File size too large. Maximum size is 5MB.",
      });
    }
  }

  if (error.message === "Only images and PDF files are allowed!") {
    return res.status(400).json({
      message: error.message,
    });
  }

  res.status(500).json({
    message: "An error occurred during file upload",
  });
});

export default router;
