import React, { useMemo, useContext, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Grid from "@mui/material/Grid2";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { ThemeContext } from "../../contexts/ThemeContext";

// Reusable component for rendering a section
function Section({ title, children }) {
  return (
    <div>
      <h5>{title}</h5>
      <div style={{ display: "flex", alignItems: "center" }}>{children}</div>
    </div>
  );
}

// Reusable component for rendering a list of info items
function InfoList({ data }) {
  return (
    <List sx={{ width: "100%" }}>
      {data.map((item, index) => (
        <React.Fragment key={index}>
          <ListItem alignItems="flex-start">
            <ListItemText primary={item.label} />
            {item.link ? (
              <a href={item.link}>
                <ListItemText
                  sx={{ color: "blue !important" }}
                  secondary={item.value}
                />
              </a>
            ) : (
              <ListItemText secondary={item.value} />
            )}
          </ListItem>
          {index < data.length - 1 && (
            <Divider variant="inset" component="li" />
          )}
        </React.Fragment>
      ))}
    </List>
  );
}

// Component for displaying employee status text
function EmployeeStatusText({ user, theme }) {
  const status = user.employeeStatus?.toLowerCase();

  if (!status || status === "active") {
    return null;
  }

  const getStatusText = () => {
    switch (status) {
      case "terminated":
        let terminatedText = `This employee has been terminated on ${user.dateOfTermination}. Reason of termination: ${user.reasonForTermination}`;
        return terminatedText;

      case "absconded":
        let abscondedText = `This employee was declared absconded on ${user.dateOfAbscond}`;
        return abscondedText;

      case "resigned":
        let resignedText = "This employee has resigned.";
        return resignedText;

      default:
        return null;
    }
  };

  const statusText = getStatusText();
  if (!statusText) return null;

  return (
    <Box
      sx={{
        mb: 3,
        p: 2,
        backgroundColor: theme === "light" ? "#f5f5f5" : "#111B21",
        borderRadius: 1,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: "bold", color: "#f15c6d" }}>
        {statusText}
      </Typography>
    </Box>
  );
}

// Component for downloading all documents as ZIP
function DocumentDownloadButton({ user }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const getFileExtension = (url) => {
    if (!url) return "";
    const parts = url.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  };

  const downloadAllDocuments = async () => {
    setIsDownloading(true);

    try {
      // Load JSZip from CDN if not already loaded
      if (!window.JSZip) {
        const script = document.createElement("script");
        script.src =
          "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        document.head.appendChild(script);

        // Wait for script to load
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      const zip = new window.JSZip();

      // Define all document URLs with their respective names
      const documents = [
        { name: "aadhar_front", url: user.aadhar_photo_front },
        { name: "aadhar_back", url: user.aadhar_photo_back },
        { name: "pan_photo", url: user.pan_photo },
        { name: "electricity_bill", url: user.electricity_bill },
        { name: "pcc", url: user.pcc },
        { name: "experience_certificate", url: user.experience_certificate },
        { name: "employee_photo", url: user.employee_photo },
      ];

      // Handle education certificates (assuming it's an array)
      if (
        user.education_certificates &&
        Array.isArray(user.education_certificates)
      ) {
        user.education_certificates.forEach((cert, index) => {
          documents.push({
            name: `education_certificate_${index + 1}`,
            url: cert,
          });
        });
      } else if (user.education_certificates) {
        // If it's a single URL
        documents.push({
          name: "education_certificate",
          url: user.education_certificates,
        });
      }

      // Filter out empty/null URLs
      const validDocuments = documents.filter(
        (doc) => doc.url && doc.url.trim() !== ""
      );

      if (validDocuments.length === 0) {
        alert("No documents available to download");
        setIsDownloading(false);
        return;
      }

      // Download and add each file to the ZIP
      const downloadPromises = validDocuments.map(async (doc) => {
        try {
          const response = await fetch(doc.url, {
            method: "GET",
            credentials: "include",
          });
          if (!response.ok) {
            console.warn(
              `Failed to download ${doc.name}: ${response.statusText}`
            );
            return null;
          }

          const blob = await response.blob();
          const extension = getFileExtension(doc.url) || "jpg"; // Default to jpg if no extension
          const fileName = `${doc.name}.${extension}`;

          zip.file(fileName, blob);
          return fileName;
        } catch (error) {
          console.error(`Error downloading ${doc.name}:`, error);
          return null;
        }
      });

      // Wait for all downloads to complete
      const results = await Promise.all(downloadPromises);
      const successfulDownloads = results.filter((result) => result !== null);

      if (successfulDownloads.length === 0) {
        alert("Failed to download any documents");
        setIsDownloading(false);
        return;
      }

      // Generate the ZIP file
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Create download link
      const url = window.URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${
        user.fullName || user.username || "employee"
      }_documents.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log(
        `Successfully downloaded ${successfulDownloads.length} documents`
      );
    } catch (error) {
      console.error("Error creating ZIP file:", error);
      alert("Failed to create ZIP file. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <button
        className="btn"
        onClick={downloadAllDocuments}
        disabled={isDownloading}
      >
        {isDownloading ? "Downloading..." : "Download All Documents"}
      </button>
      <br />
    </>
  );
}

// Main component
function BasicInfo(props) {
  const { theme } = useContext(ThemeContext);

  const addressInfo = useMemo(
    () => [
      {
        label: "Communication Address",
        value: [
          props.user.communication_address_line_1,
          props.user.communication_address_line_2,
          props.user.communication_address_city,
          props.user.communication_address_area,
          props.user.communication_address_state,
          props.user.communication_address_pincode,
        ]
          .filter(Boolean)
          .join(", "),
      },
      {
        label: "Permanent Address",
        value: [
          props.user.permanent_address_line_1,
          props.user.permanent_address_line_2,
          props.user.permanent_address_city,
          props.user.permanent_address_area,
          props.user.permanent_address_state,
          props.user.permanent_address_pincode,
        ]
          .filter(Boolean)
          .join(", "),
      },
    ],
    [props.user]
  );

  const profileInfo = useMemo(
    () => [
      { label: "Username", value: props.user.username },
      { label: "Name", value: props.user.fullName },
      { label: "Birth Date", value: props.user.dob },
      { label: "Blood Group", value: props.user.blood_group },
      { label: "Highest Qualification", value: props.user.qualification },
    ],
    [props.user]
  );

  const contactInfo = useMemo(
    () => [
      { label: "Email", value: props.user.email },
      { label: "Official Email", value: props.user.official_email },
      { label: "Mobile", value: props.user.mobile },
    ],
    [props.user]
  );

  const bankInfo = useMemo(
    () => [
      { label: "Bank Account Number", value: props.user.bank_account_no },
      { label: "Bank Name", value: props.user.bank_name },
      { label: "IFSC", value: props.user.ifsc_code },
    ],
    [props.user]
  );

  const employmentInfo = useMemo(
    () => [
      { label: "Company", value: props.user.company },
      { label: "Designation", value: props.user.designation },
      { label: "Department", value: props.user.department },
      { label: "Joining Date", value: props.user.joining_date },
    ],
    [props.user]
  );

  const documentsInfo = useMemo(
    () => [
      {
        label: "AADHAR Number",
        value: props.user.aadhar_no,
        link: props.user.aadhar_photo_front,
      },
      {
        label: "PAN Number",
        value: props.user.pan_no,
        link: props.user.pan_photo,
      },
      { label: "PF Number", value: props.user.pf_no },
      { label: "UAN Number", value: props.user.uan_no },
      { label: "ESIC Number", value: props.user.esic_no },
    ],
    [props.user]
  );

  return (
    <Grid container className="profile-container">
      {/* Employee Status Text */}
      <Grid size={12}>
        <EmployeeStatusText user={props.user} theme={theme} />
      </Grid>

      {/* First Row */}
      <Grid size={{ xs: 12, md: 5.9 }}>
        <Section title="Profile Info">
          <Avatar
            src={props.user.employee_photo}
            style={{ width: 80, height: 80 }}
          />
          <InfoList data={profileInfo} />
        </Section>
      </Grid>

      {/* Vertical divider - only visible on medium screens and up */}
      <Grid
        size={{ xs: 0, md: 0.2 }}
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        <Divider orientation="vertical" flexItem />
      </Grid>

      <Grid size={{ xs: 12, md: 5.9 }}>
        <Section title="Contact Info">
          <InfoList data={contactInfo} />
        </Section>
      </Grid>

      {/* Divider after first row */}
      <Grid size={12}>
        <Divider sx={{ my: 2 }} />
      </Grid>

      {/* Second Row */}
      <Grid size={{ xs: 12, md: 5.9 }}>
        <Section title="Address Info">
          <InfoList data={addressInfo} />
        </Section>
      </Grid>

      {/* Vertical divider - only visible on medium screens and up */}
      <Grid
        size={{ xs: 0, md: 0.2 }}
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        <Divider orientation="vertical" flexItem />
      </Grid>

      <Grid size={{ xs: 12, md: 5.9 }}>
        <Section title="Bank Info">
          <InfoList data={bankInfo} />
        </Section>
      </Grid>

      {/* Divider after second row */}
      <Grid size={12}>
        <Divider sx={{ my: 2 }} />
      </Grid>

      {/* Third Row */}
      <Grid size={{ xs: 12, md: 5.9 }}>
        <Section title="Employment Info">
          <InfoList data={employmentInfo} />
        </Section>
      </Grid>

      {/* Vertical divider - only visible on medium screens and up */}
      <Grid
        size={{ xs: 0, md: 0.2 }}
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        <Divider orientation="vertical" flexItem />
      </Grid>

      <Grid size={{ xs: 12, md: 5.9 }}>
        <Section title="Documents">
          <InfoList data={documentsInfo} />
        </Section>
      </Grid>

      {/* Divider after third row */}
      <Grid size={12}>
        <Divider sx={{ my: 2 }} />
      </Grid>

      {/* Download All Documents Button */}
      <Grid size={12}>
        <DocumentDownloadButton user={props.user} />
      </Grid>
    </Grid>
  );
}

export default React.memo(BasicInfo);
