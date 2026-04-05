import axios from "axios";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

const handleFileUpload = async (
  event,
  formik,
  formikField,
  folderName,
  setFileSnackbar,
  multiple,
  setAlert,
  username,
) => {
  event.options.clear();

  if (!event.files || event.files.length === 0) {
    setAlert({
      open: true,
      message: "No file selected. Please select a file to upload.",
      severity: "error",
    });
    return;
  }

  const MAX_FILE_SIZE =
    (Number(import.meta.env.VITE_MAX_FILE_SIZE) || 0) * 1024 * 1024;

  try {
    const uploadedFiles: string[] = [];

    for (let i = 0; i < event.files.length; i++) {
      const file = event.files[i];

      if (file.size > MAX_FILE_SIZE) {
        setAlert({
          open: true,
          message: `File "${file.name}" exceeds the 15MB limit.`,
          severity: "error",
        });
        return;
      }

      if (file.size === 0) {
        setAlert({
          open: true,
          message: `File "${file.name}" is empty. Please select a valid file.`,
          severity: "error",
        });
        return;
      }

      setAlert({
        open: true,
        message: `Uploading "${file.name}"...`,
        severity: "info",
      });

      // Step 1: get pre-signed URL from server
      const { data: presignedRes } = await apiClient.post(
        API_ENDPOINTS.UPLOAD_PRESIGNED_URL,
        {
          fileName: file.name,
          fileType: file.type,
          folder: folderName,
          username,
          formikField,
        },
      );

      const { url, fileUrl } = presignedRes.data;

      // Step 2: PUT file directly to S3 (plain axios — no auth headers)
      await axios.put(url, file, {
        headers: { "Content-Type": file.type },
      });

      uploadedFiles.push(fileUrl);
    }

    formik.setValues((values) => ({
      ...values,
      [formikField]: multiple ? uploadedFiles : uploadedFiles[0],
    }));

    setFileSnackbar(true);
    setAlert({
      open: true,
      message: `File${uploadedFiles.length > 1 ? "s" : ""} uploaded successfully!`,
      severity: "success",
    });

    setTimeout(() => {
      setFileSnackbar(false);
    }, 3000);
  } catch (err) {
    console.error("File upload error:", err);

    const errorMessage =
      err.response?.data?.message ||
      "Error uploading file(s). Please try again.";

    let severity = "error";
    let displayMessage = errorMessage;

    if (
      errorMessage.includes("Virus detected") ||
      errorMessage.includes("virus_scan")
    ) {
      displayMessage =
        "Security Alert: File contains malware and has been quarantined for your protection.";
    } else if (
      errorMessage.includes("File signature mismatch") ||
      errorMessage.includes("magic_number")
    ) {
      displayMessage =
        "File validation failed: The file type doesn't match its content. Please upload a valid file.";
    } else if (
      errorMessage.includes("Path traversal") ||
      errorMessage.includes("path_traversal")
    ) {
      displayMessage =
        "Invalid filename detected. Please rename the file and try again.";
    } else if (
      errorMessage.includes("Dangerous file") ||
      errorMessage.includes("extension")
    ) {
      displayMessage =
        "This file type is not allowed for security reasons. Please upload an allowed file format.";
    } else if (errorMessage.includes("File size exceeds")) {
      displayMessage = errorMessage;
    } else if (
      errorMessage.includes("Dangerous pattern detected") ||
      errorMessage.includes("content")
    ) {
      displayMessage =
        "Security Alert: Suspicious content detected in the file.";
    } else if (errorMessage.includes("quarantined")) {
      displayMessage =
        "File has been quarantined due to security concerns. Please contact support if you believe this is an error.";
      severity = "warning";
    }

    setAlert({
      open: true,
      message: displayMessage,
      severity,
    });

    if (import.meta.env.MODE === "production") {
      if (errorMessage.includes("Virus") || errorMessage.includes("malware")) {
        console.warn("SECURITY: Malware upload attempt detected", {
          filename: err.response?.data?.filename,
          user: username,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
};

export default handleFileUpload;
