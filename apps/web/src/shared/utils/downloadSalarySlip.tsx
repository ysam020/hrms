import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

const downloadSalarySlip = async (
  date,
  username,
  setIsDownloading,
  setAlert,
) => {
  if (!date) {
    alert("Please select a month and year");
    return;
  }

  setIsDownloading(true);
  try {
    const response = await apiClient(
      API_ENDPOINTS.GENERATE_SALARY_SLIP(
        username,
        date.split("-")[0],
        date.split("-")[1],
      ),
      {
        responseType: "blob",
      },
    );

    // Create blob link to download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;

    // Extract filename from response headers or create default
    const contentDisposition = response.headers["content-disposition"];
    let filename = `salary_slip_${username}_${date}.pdf`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Clean up the URL object
    window.URL.revokeObjectURL(url);

    // Show success message
    setAlert({
      open: true,
      message: "Salary slip downloaded successfully",
      severity: "success",
    });
  } catch (error) {
    console.error("Salary slip download error:", error);

    let errorMessage = "Failed to download salary slip";

    // When responseType is 'blob', error responses are also blobs
    // We need to parse the blob to get the JSON error message
    if (error.response?.data instanceof Blob) {
      try {
        // Convert blob to text
        const errorText = await error.response.data.text();

        // Try to parse as JSON
        const errorData = JSON.parse(errorText);

        // Extract the error message
        errorMessage = errorData.message || errorMessage;
      } catch (parseError) {
        // If parsing fails, check for text content
        console.error("Error parsing error response:", parseError);

        // Fallback to generic message with status code
        if (error.response?.status === 404) {
          errorMessage = "Salary data not found for the selected period";
        } else if (error.response?.status === 400) {
          errorMessage = "Invalid request. Please check the selected date";
        } else if (error.response?.status) {
          errorMessage = `Error ${error.response.status}: Unable to download salary slip`;
        }
      }
    } else if (error.response?.data?.message) {
      // Standard JSON error response (shouldn't happen with blob, but just in case)
      errorMessage = error.response.data.message;
    } else if (error.message) {
      // Network error or other issues
      errorMessage = error.message;
    }

    setAlert({
      open: true,
      message: errorMessage,
      severity: "error",
    });
  } finally {
    setIsDownloading(false);
  }
};

export default downloadSalarySlip;
