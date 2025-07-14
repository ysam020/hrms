import apiClient from "../config/axiosConfig";

const downloadSalarySlip = async (date, username, setIsDownloading) => {
  if (!date) {
    alert("Please select a month and year");
    return;
  }

  setIsDownloading(true);
  try {
    const response = await apiClient.get(
      `/generate-salary-slip/${username}/${date.split("-")[0]}/${
        date.split("-")[1]
      }`,
      {
        responseType: "blob", // Important: Tell axios to expect binary data
      }
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
  } catch (error) {
    console.error("Error downloading salary slip:", error);
    alert("Failed to download salary slip. Please try again.");
  } finally {
    setIsDownloading(false);
  }
};

export default downloadSalarySlip;
