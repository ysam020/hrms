import React from "react";
import OpenInNew from "@mui/icons-material/OpenInNew";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import Work from "@mui/icons-material/Work";
import DateRange from "@mui/icons-material/DateRange";
import Description from "@mui/icons-material/Description";
import AttachMoney from "@mui/icons-material/AttachMoney";
import Person from "@mui/icons-material/Person";
import Group from "@mui/icons-material/Group";
import Assignment from "@mui/icons-material/Assignment";
import Schedule from "@mui/icons-material/Schedule";

type DataFieldProps = {
  icon: React.ReactElement;
  label: string;
  value: any;
  link?: string;
  color?: string;
};

const JobDetails = (props) => {
  const formatFieldValue = (value) => {
    if (!value || value === "" || value === null || value === undefined) {
      return "N/A";
    }
    return value;
  };

  // Individual props field component
  const DataField = ({
    icon,
    label,
    value,
    link,
    color = "primary.main",
  }: DataFieldProps) => {
    const formattedValue = formatFieldValue(value);

    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flex: 1,
          }}
        >
          <Box
            sx={{
              color: color,
              display: "flex",
              alignItems: "center",
            }}
          >
            {React.cloneElement(icon, { sx: { fontSize: 18 } })}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                fontSize: "0.7rem",
              }}
            >
              {label}
            </Typography>
            <Typography
              variant="body2"
              color={
                formattedValue === "N/A" ? "text.disabled" : "text.primary"
              }
              sx={{
                fontWeight: formattedValue === "N/A" ? 400 : 500,
                mt: 0.25,
                fontSize: "0.9rem",
                fontStyle: formattedValue === "N/A" ? "italic" : "normal",
              }}
            >
              {formattedValue}
            </Typography>
          </Box>
        </Box>

        {link && value && (
          <IconButton
            size="small"
            onClick={() => window.open(link, "_blank")}
            sx={{
              color: "primary.main",
            }}
          >
            <OpenInNew sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>
    );
  };

  // Section component
  const Section = ({ title, children, icon }) => (
    <Box sx={{ backgroundColor: "background.default", p: 1, borderRadius: 2 }}>
      <Typography
        variant="h6"
        fontWeight={600}
        sx={{
          mb: 1,
          display: "flex",
          alignItems: "center",
          fontSize: "1rem",
        }}
      >
        <Box
          sx={{
            mr: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          {icon}
        </Box>
        {title}
        <Box
          sx={{
            ml: 2,
            height: 1,
            bgcolor: "divider",
            flex: 1,
          }}
        />
      </Typography>

      <Stack spacing={1}>
        {React.Children.map(children, (child, index) => (
          <Card key={index} variant="outlined">
            <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
              {child}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );

  if (!props) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 1 }}>
        <Typography>Loading job details...</Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ p: 0 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 3,
          mb: 1,
        }}
      >
        {/* Job Information */}
        <Section title="Job Information" icon={<Work />}>
          <DataField
            icon={<Work />}
            label="Job Title"
            value={props?.jobTitle}
            color="primary.main"
          />
          <DataField
            icon={<DateRange />}
            label="Job Posting Date"
            value={
              props?.jobPostingDate
                ? new Date(props.jobPostingDate).toLocaleDateString()
                : null
            }
            color="primary.main"
          />
          <DataField
            icon={<DateRange />}
            label="Application Deadline"
            value={
              props?.applicationDeadline
                ? new Date(props.applicationDeadline).toLocaleDateString()
                : null
            }
            color="primary.main"
          />
          <DataField
            icon={<Description />}
            label="Job Description"
            value={props?.jobDescription}
            color="primary.main"
          />
        </Section>

        {/* Requirements & Budget */}
        <Section title="Requirements & Budget" icon={<Assignment />}>
          <DataField
            icon={<Assignment />}
            label="Required Skills"
            value={props?.requiredSkills}
            color="success.main"
          />
          <DataField
            icon={<Schedule />}
            label="Required Experience"
            value={props?.experience ? `${props.experience} Years` : null}
            color="success.main"
          />
          <DataField
            icon={<AttachMoney />}
            label="Budget"
            value={
              props?.budget
                ? `${props.budget[0]} - ${props.budget[1]} LPA`
                : null
            }
            color="success.main"
          />
          <DataField
            icon={<Person />}
            label="Hiring Manager"
            value={props?.hiringManager}
            color="success.main"
          />
        </Section>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 3,
        }}
      >
        {/* Hiring Statistics */}
        <Section title="Hiring Statistics" icon={<Group />}>
          <DataField
            icon={<Group />}
            label="Number of Vacancies"
            value={props?.numberOfVacancies}
            color="warning.main"
          />
          <DataField
            icon={<Person />}
            label="Candidates Hired"
            value={props?.candidatesHired}
            color="warning.main"
          />
          <DataField
            icon={<Assignment />}
            label="Total Applications"
            value={props?.jobApplications?.length}
            color="warning.main"
          />
        </Section>
      </Box>
    </Container>
  );
};

export default JobDetails;
