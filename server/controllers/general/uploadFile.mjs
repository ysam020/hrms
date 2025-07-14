import express from "express";
import {
  uploadSingleFile,
  uploadMultipleFiles,
} from "../config/multerConfig.mjs";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// File upload endpoint for individual files
router.post("/upload-file", uploadSingleFile, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { folderName, username } = req.body;

    // Generate file URL
    const fileUrl = `/uploads/${folderName}/${username}/${req.file.filename}`;

    res.json({
      message: "File uploaded successfully",
      fileUrl: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ message: "Error uploading file" });
  }
});

// Multiple files upload endpoint
router.post("/upload-files", uploadMultipleFiles, (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const { folderName, username } = req.body;

    const uploadedFiles = req.files.map((file) => ({
      fileUrl: `/uploads/${folderName}/${username}/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    }));

    res.json({
      message: "Files uploaded successfully",
      files: uploadedFiles,
    });
  } catch (error) {
    console.error("Files upload error:", error);
    res.status(500).json({ message: "Error uploading files" });
  }
});

// Serve uploaded files
router.use("/uploads", express.static(path.join(__dirname, "../uploads")));

export default router;
