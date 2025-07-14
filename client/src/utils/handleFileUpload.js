import apiClient from "../config/axiosConfig";

const handleFileUpload = async (
  event,
  formik,
  formikField,
  folderName,
  setFileSnackbar,
  multiple,
  setAlert,
  username
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

  const MAX_FILE_SIZE = 0.5 * 1024 * 1024;

  try {
    const uploadedFiles = [];

    for (let i = 0; i < event.files.length; i++) {
      const file = event.files[i];

      if (file.size > MAX_FILE_SIZE) {
        setAlert({
          open: true,
          message: `File ${file.name} exceeds the 5MB limit.`,
          severity: "error",
        });
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folderName", folderName);
      formData.append("username", username);

      // Send folderName and username as query params
      const query = `?folderName=${encodeURIComponent(
        folderName
      )}&username=${encodeURIComponent(username)}`;

      const response = await apiClient.post(`/upload-file${query}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const uploadedFileUrl = response.data.fileUrl;
      uploadedFiles.push(uploadedFileUrl);
    }

    formik.setValues((values) => ({
      ...values,
      [formikField]: multiple ? uploadedFiles : uploadedFiles[0],
    }));
    setFileSnackbar(true);

    setTimeout(() => {
      setFileSnackbar(false);
    }, 3000);
  } catch (err) {
    console.error("File upload error:", err);
    setAlert({
      open: true,
      message:
        err.response?.data?.message ||
        "Error uploading file(s). Please try again.",
      severity: "error",
    });
  }
};

export default handleFileUpload;
