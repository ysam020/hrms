import { cloneElement, memo, type ReactElement } from "react";
import dayjs from "dayjs";
import { alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
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
import CalendarToday from "@mui/icons-material/CalendarToday";
import CreditCard from "@mui/icons-material/CreditCard";
import Badge from "@mui/icons-material/Badge";
import Cake from "@mui/icons-material/Cake";
import BloodtypeOutlined from "@mui/icons-material/BloodtypeOutlined";
import Warning from "@mui/icons-material/Warning";
import Error from "@mui/icons-material/Error";
import Info from "@mui/icons-material/Info";

type DataFieldProps = {
  icon: ReactElement;
  label: string;
  value: any;
  link?: string;
  color?: string;
};

function formatDate(value: any, fmt = "DD MMM YYYY"): string {
  if (!value) return "";
  const d = dayjs(value);
  return d.isValid() ? d.format(fmt) : "";
}

function formatFieldValue(value: any) {
  if (value === null || value === undefined || value === "") return "N/A";
  return value;
}

function formatAddress(fields: (string | null | undefined)[]) {
  const filtered = fields.filter(Boolean);
  return filtered.length > 0 ? filtered.join(", ") : "N/A";
}

type StatusPalette = "error" | "warning" | "info";

const STATUS_CONFIG: Record<
  string,
  { icon: ReactElement; palette: StatusPalette; text: (u: any) => string }
> = {
  terminated: {
    icon: <Error sx={{ fontSize: 18 }} />,
    palette: "error",
    text: (u) =>
      `Terminated ${formatFieldValue(u.dateOfTermination)} — ${formatFieldValue(u.reasonForTermination)}`,
  },
  absconded: {
    icon: <Warning sx={{ fontSize: 18 }} />,
    palette: "warning",
    text: (u) => `Absconded ${formatFieldValue(u.dateOfAbscond)}`,
  },
  resigned: {
    icon: <Info sx={{ fontSize: 18 }} />,
    palette: "info",
    text: () => "Employee has resigned",
  },
};

function StatusBanner({ user }: { user: any }) {
  const status = user.employeeStatus?.toLowerCase();
  const config = status && STATUS_CONFIG[status];
  if (!config) return null;
  const { palette } = config;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 1,
        mb: 2,
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: `${palette}.main`,
        bgcolor: (t) =>
          alpha(
            t.palette[palette].main,
            t.palette.mode === "light" ? 0.08 : 0.16,
          ),
      }}
    >
      <Box sx={{ color: `${palette}.main`, display: "flex" }}>
        {config.icon}
      </Box>
      <Typography
        variant="body2"
        sx={{ color: `${palette}.main`, fontWeight: 600 }}
      >
        {config.text(user)}
      </Typography>
    </Box>
  );
}

/** Icon + label + value — the compact building block for every field. */
function DataField({
  icon,
  label,
  value,
  link,
  color = "primary.main",
}: DataFieldProps) {
  const formattedValue = formatFieldValue(value);
  const isEmpty = formattedValue === "N/A";

  return (
    <Box
      sx={{ display: "flex", alignItems: "flex-start", gap: 1, minWidth: 0 }}
    >
      {cloneElement(icon, {
        sx: { fontSize: 16, color, mt: 0.25, flexShrink: 0 },
      } as any)}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "text.secondary",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            fontSize: "0.65rem",
          }}
        >
          {label}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            variant="body2"
            sx={{
              color: isEmpty ? "text.disabled" : "text.primary",
              fontWeight: isEmpty ? 400 : 500,
              fontStyle: isEmpty ? "italic" : "normal",
              wordBreak: "break-word",
            }}
          >
            {formattedValue}
          </Typography>
          {link && value && (
            <IconButton
              size="small"
              aria-label={`Open ${value} in a new tab`}
              onClick={() => window.open(link, "_blank")}
              sx={{ color: "primary.main", p: 0.25 }}
            >
              <OpenInNew sx={{ fontSize: 14, color: "primary.main" }} />
            </IconButton>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** Section heading + a compact responsive grid of DataFields — no nested cards. */
function Section({
  title,
  icon,
  gridCols = 2,
  children,
}: {
  title: string;
  icon: ReactElement;
  gridCols?: number;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
        {cloneElement(icon, {
          sx: { fontSize: 16, color: "text.secondary" },
        } as any)}
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "text.secondary",
          }}
        >
          {title}
        </Typography>
        <Box sx={{ flex: 1, height: 1, bgcolor: "divider" }} />
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: gridCols > 1 ? `repeat(${gridCols}, 1fr)` : "1fr",
          },
          rowGap: 1.5,
          columnGap: 3,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

function BasicInfo({ user }: { user: any }) {
  return (
    <Container maxWidth="lg" disableGutters>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2,
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <StatusBanner user={user} />

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "center", sm: "center" }}
          >
            <Avatar
              src={user?.employee_photo}
              sx={{ width: 64, height: 64, fontSize: "1.5rem" }}
            >
              {(user.fullName || user.username || "?").charAt(0).toUpperCase()}
            </Avatar>

            <Box
              sx={{
                flex: 1,
                textAlign: { xs: "center", sm: "left" },
                minWidth: 0,
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: "1.05rem", sm: "1.2rem" },
                }}
              >
                {formatFieldValue(user.fullName || user.username)}
              </Typography>

              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                sx={{
                  mt: 0.5,
                  mb: 0.75,
                  gap: 0.75,
                  justifyContent: { xs: "center", sm: "flex-start" },
                }}
              >
                {user.designation && (
                  <Chip
                    label={user.designation}
                    size="small"
                    color="primary"
                    sx={{ fontWeight: 500, height: 24 }}
                  />
                )}
                {user.department && (
                  <Chip
                    label={user.department}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 500, height: 24 }}
                  />
                )}
              </Stack>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  justifyContent: { xs: "center", sm: "flex-start" },
                  color: formatDate(user.joining_date)
                    ? "text.secondary"
                    : "text.disabled",
                }}
              >
                <CalendarToday sx={{ fontSize: 14 }} />
                <Typography
                  variant="caption"
                  sx={{
                    fontStyle: formatDate(user.joining_date)
                      ? "normal"
                      : "italic",
                  }}
                >
                  {formatDate(user.joining_date)
                    ? `Joined ${formatDate(user.joining_date)}`
                    : "Joining date: N/A"}
                </Typography>
              </Box>
            </Box>
          </Stack>
        </Box>

        {/* Content */}
        <Stack spacing={2.5} sx={{ p: { xs: 2, sm: 2.5 } }}>
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
              value={formatDate(user.dob)}
            />
            <DataField
              icon={<BloodtypeOutlined />}
              label="Blood Group"
              value={user.blood_group}
            />
          </Section>

          <Section title="Contact Information" icon={<Phone />}>
            <DataField
              icon={<Email />}
              label="Login Email"
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
              icon={<Email />}
              label="Personal Email"
              value={user.personalEmail}
              color="success.main"
            />
            <DataField
              icon={<Phone />}
              label="Mobile Number"
              value={user.mobile}
              color="success.main"
            />
          </Section>

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
              value={formatDate(user.joining_date)}
              color="warning.main"
            />
          </Section>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 2.5,
            }}
          >
            <Section title="Address Information" icon={<Home />} gridCols={1}>
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

            <Section
              title="Banking Information"
              icon={<AccountBalance />}
              gridCols={1}
            >
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
      </Paper>
    </Container>
  );
}

export default memo(BasicInfo);
