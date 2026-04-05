import React, { useContext } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Person from "@mui/icons-material/Person";
import Email from "@mui/icons-material/Email";
import Phone from "@mui/icons-material/Phone";
import LocationOn from "@mui/icons-material/LocationOn";
import Business from "@mui/icons-material/Business";
import AccountBalance from "@mui/icons-material/AccountBalance";
import Description from "@mui/icons-material/Description";
import OpenInNew from "@mui/icons-material/OpenInNew";
import Work from "@mui/icons-material/Work";
import Home from "@mui/icons-material/Home";
import CreditCard from "@mui/icons-material/CreditCard";
import Badge from "@mui/icons-material/Badge";
import Cake from "@mui/icons-material/Cake";
import BloodtypeOutlined from "@mui/icons-material/BloodtypeOutlined";
import Warning from "@mui/icons-material/Warning";
import Error from "@mui/icons-material/Error";
import Info from "@mui/icons-material/Info";
import { ThemeContext } from "@web/app/providers/ThemeContext";

type DataFieldProps = {
  icon: React.ReactElement;
  label: string;
  value: any;
  link?: string;
  color?: string;
};

function BasicInfo({ user }) {
  const { theme } = useContext(ThemeContext);

  const formatFieldValue = (value) => {
    if (!value || value === "" || value === null || value === undefined) {
      return "N/A";
    }
    return value;
  };

  const formatAddress = (addressFields) => {
    const filteredFields = addressFields.filter(
      (field) => field && field !== "" && field !== null && field !== undefined,
    );
    return filteredFields.length > 0 ? filteredFields.join(", ") : "N/A";
  };

  // Status indicator component
  const getStatusIndicator = () => {
    const status = user.employeeStatus?.toLowerCase();
    if (!status || status === "active") return null;

    const configs = {
      terminated: {
        icon: <Error sx={{ fontSize: 16 }} />,
        color: "#dc2626",
        text: `Terminated ${formatFieldValue(
          user.dateOfTermination,
        )} - ${formatFieldValue(user.reasonForTermination)}`,
        bgColor: theme === "light" ? "#fef2f2" : "rgba(220, 38, 38, 0.1)",
        borderColor: theme === "light" ? "#fecaca" : "rgba(220, 38, 38, 0.3)",
      },
      absconded: {
        icon: <Warning sx={{ fontSize: 16 }} />,
        color: "#d97706",
        text: `Absconded ${formatFieldValue(user.dateOfAbscond)}`,
        bgColor: theme === "light" ? "#fffbeb" : "rgba(217, 119, 6, 0.1)",
        borderColor: theme === "light" ? "#fed7aa" : "rgba(217, 119, 6, 0.3)",
      },
      resigned: {
        icon: <Info sx={{ fontSize: 16 }} />,
        color: "#0284c7",
        text: "Employee has resigned",
        bgColor: theme === "light" ? "#f0f9ff" : "rgba(2, 132, 199, 0.1)",
        borderColor: theme === "light" ? "#bae6fd" : "rgba(2, 132, 199, 0.3)",
      },
    };

    const config = configs[status];
    if (!config) return null;

    return (
      <Card
        variant="outlined"
        sx={{
          mb: 2,
          borderColor: config.borderColor,
          bgcolor: config.bgColor,
          borderRadius: 2,
        }}
      >
        <CardContent
          sx={{
            p: { xs: 1.5, sm: 2 },
            "&:last-child": { pb: { xs: 1.5, sm: 2 } },
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ color: config.color }}>{config.icon}</Box>
            <Typography
              variant="body2"
              sx={{
                color: config.color,
                fontWeight: 600,
                fontSize: { xs: "0.8rem", sm: "0.9rem" },
              }}
            >
              {config.text}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  // Individual data field component
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
          gap: { xs: 1, sm: 2 },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 0.75, sm: 1 },
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
            {React.cloneElement(icon, { sx: { fontSize: { xs: 16, sm: 18 } } })}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                fontSize: { xs: "0.65rem", sm: "0.7rem" },
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
                fontSize: { xs: "0.8rem", sm: "0.9rem" },
                fontStyle: formattedValue === "N/A" ? "italic" : "normal",
                wordBreak: "break-word",
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
              flexShrink: 0,
            }}
          >
            <OpenInNew sx={{ fontSize: { xs: 14, sm: 16 } }} />
          </IconButton>
        )}
      </Box>
    );
  };

  // Section component
  const Section = ({ title, children, icon }) => (
    <Box
      sx={{
        backgroundColor: "var(--card-background)",
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2,
      }}
    >
      <Typography
        variant="h6"
        fontWeight={600}
        sx={{
          mb: { xs: 1.5, sm: 2 },
          display: "flex",
          alignItems: "center",
          fontSize: { xs: "0.9rem", sm: "1rem" },
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
            display: { xs: "none", sm: "block" },
          }}
        />
      </Typography>

      <Stack spacing={{ xs: 1, sm: 1 }}>
        {React.Children.map(children, (child, index) => (
          <Card key={index} variant="outlined">
            <CardContent
              sx={{
                p: { xs: 1.5, sm: 2 },
                "&:last-child": { pb: { xs: 1.5, sm: 2 } },
              }}
            >
              {child}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );

  return (
    <Container maxWidth="lg" sx={{ px: { xs: 0, sm: 2, md: 3 } }}>
      <Paper
        elevation={2}
        sx={{
          borderRadius: { xs: 2, sm: 3 },
          overflow: "hidden",
          bgcolor: theme === "light" ? "#fff" : "#212e35",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            bgcolor: theme === "light" ? "#FDFDFD" : "#212e35",
            p: { xs: 2, sm: 3 },
          }}
        >
          {getStatusIndicator()}

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 2, sm: 3 }}
            alignItems={{ xs: "center", sm: "center" }}
          >
            <Avatar
              sx={{
                width: { xs: 64, sm: 80 },
                height: { xs: 64, sm: 80 },
              }}
              src={user?.employee_photo}
            />

            <Box
              sx={{
                flex: 1,
                textAlign: { xs: "center", sm: "left" },
                width: { xs: "100%", sm: "auto" },
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  mb: 1,
                  fontSize: { xs: "0.5rem", sm: "0.875rem", md: "1.5rem" },
                }}
              >
                {formatFieldValue(user.fullName || user.username)}
              </Typography>

              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                sx={{
                  mb: 1,
                  justifyContent: { xs: "center", sm: "flex-start" },
                }}
              >
                {user.designation && (
                  <Chip
                    label={user.designation}
                    sx={{
                      backgroundColor:
                        theme === "light" ? "#05B6D3" : "#111b21",
                      color: theme === "light" ? "#fff" : "#a5a9ab",
                      fontWeight: 500,
                      fontSize: { xs: "0.75rem", sm: "0.8125rem" },
                      height: { xs: 28, sm: 32 },
                      mb: { xs: 0.5 },
                    }}
                    style={{ marginBottom: "10px" }}
                  />
                )}
                {user.department && (
                  <Chip
                    label={user.department}
                    sx={{
                      backgroundColor:
                        theme === "light" ? "#05B6D3" : "#111b21",
                      color: theme === "light" ? "#fff" : "#a5a9ab",
                      fontWeight: 500,
                      fontSize: { xs: "0.75rem", sm: "0.8125rem" },
                      height: { xs: 28, sm: 32 },
                      mb: { xs: 0.5 },
                    }}
                  />
                )}
              </Stack>

              {user.joining_date ? (
                <Typography
                  variant="body1"
                  sx={{
                    opacity: 0.9,
                    fontSize: { xs: "0.875rem", sm: "1rem" },
                  }}
                >
                  📅 Joined {user.joining_date}
                </Typography>
              ) : (
                <Typography
                  variant="body1"
                  sx={{
                    opacity: 0.6,
                    fontStyle: "italic",
                    fontSize: { xs: "0.875rem", sm: "1rem" },
                  }}
                >
                  📅 Joining date: N/A
                </Typography>
              )}
            </Box>
          </Stack>
        </Box>

        {/* Content */}
        <Box
          sx={{
            p: { xs: 2, sm: 3 },
            bgcolor: theme === "light" ? "#f9fafb" : "#1c262a",
          }}
        >
          <Stack spacing={{ xs: 2, sm: 2 }}>
            {/* Personal Information */}
            <Section title="Personal Information" icon={<Person />}>
              <DataField
                icon={<Badge />}
                label="Username"
                value={user.username}
              />
              <DataField
                icon={<Person />}
                label="Full Name"
                value={user.fullName}
              />
              <DataField
                icon={<Cake />}
                label="Date of Birth"
                value={user.dob}
              />
              <DataField
                icon={<BloodtypeOutlined />}
                label="Blood Group"
                value={user.blood_group}
              />
            </Section>

            {/* Contact Information */}
            <Section title="Contact Information" icon={<Phone />}>
              <DataField
                icon={<Email />}
                label="Personal Email"
                value={user.email}
                color="success.main"
              />
              <DataField
                icon={<Email />}
                label="Official Email"
                value={user.official_email}
                color="success.main"
              />
              <DataField
                icon={<Phone />}
                label="Mobile Number"
                value={user.mobile}
                color="success.main"
              />
            </Section>

            {/* Employment Information */}
            <Section title="Employment Information" icon={<Work />}>
              <DataField
                icon={<Work />}
                label="Designation"
                value={user.designation}
                color="warning.main"
              />
              <DataField
                icon={<Business />}
                label="Department"
                value={user.department}
                color="warning.main"
              />
              <DataField
                icon={<Badge />}
                label="Joining Date"
                value={user.joining_date}
                color="warning.main"
              />
            </Section>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "1fr 1fr",
                },
                gap: { xs: 2, sm: 2 },
              }}
            >
              {/* Address Information */}
              <Section title="Address Information" icon={<Home />}>
                <DataField
                  icon={<Home />}
                  label="Current Address"
                  value={formatAddress([
                    user.communication_address_line_1,
                    user.communication_address_city,
                    user.communication_address_state,
                    user.communication_address_pincode,
                  ])}
                  color="info.main"
                />
                <DataField
                  icon={<LocationOn />}
                  label="Permanent Address"
                  value={formatAddress([
                    user.permanent_address_line_1,
                    user.permanent_address_city,
                    user.permanent_address_state,
                    user.permanent_address_pincode,
                  ])}
                  color="info.main"
                />
              </Section>

              {/* Banking Information */}
              <Section title="Banking Information" icon={<AccountBalance />}>
                <DataField
                  icon={<AccountBalance />}
                  label="Account Number"
                  value={user.bank_account_no}
                  color="secondary.main"
                />
                <DataField
                  icon={<CreditCard />}
                  label="Bank Name"
                  value={user.bank_name}
                  color="secondary.main"
                />
                <DataField
                  icon={<AccountBalance />}
                  label="IFSC Code"
                  value={user.ifsc_code}
                  color="secondary.main"
                />
              </Section>
            </Box>

            {/* Documents */}
            <Section title="Documents" icon={<Description />}>
              <DataField
                icon={<Description />}
                label="AADHAR Number"
                value={user.aadhar_no}
                link={user.aadhar_photo_front}
                color="error.main"
              />
              <DataField
                icon={<CreditCard />}
                label="PAN Number"
                value={user.pan_no}
                link={user.pan_photo}
                color="error.main"
              />
              <DataField
                icon={<Description />}
                label="PF Number"
                value={user.pf_no}
                color="error.main"
              />
              <DataField
                icon={<Description />}
                label="UAN Number"
                value={user.uan_no}
                color="error.main"
              />
              <DataField
                icon={<Description />}
                label="ESIC Number"
                value={user.esic_no}
                color="error.main"
              />
            </Section>
          </Stack>
        </Box>
      </Paper>
    </Container>
  );
}

export default React.memo(BasicInfo);
