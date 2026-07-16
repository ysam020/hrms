import { alpha } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import type { Employee, OrgChartPerson, RoleConfig } from "./types";

export const toEmployee = (
  person: OrgChartPerson,
  department: string,
): Employee => {
  const [first_name, ...rest] = person.name.split(" ");
  return {
    id: person.id,
    first_name: first_name ?? person.name,
    last_name: rest.join(" "),
    username: person.username,
    department,
    designation: person.designation ?? "",
    employeeStatus: "Active",
    employee_photo: person.employeePhoto ?? "",
  };
};

export const getRoleConfig = (
  designation: string,
  theme: Theme,
): RoleConfig => {
  const d = designation?.toUpperCase() ?? "";
  if (d === "CEO") {
    return {
      color: theme.palette.secondary.main,
      icon: "👑",
      bgColor: alpha(theme.palette.secondary.main, 0.1),
      borderColor: theme.palette.secondary.main,
    };
  }
  if (d.includes("MANAGER")) {
    return {
      color: theme.palette.error.main,
      icon: "🎯",
      bgColor: alpha(theme.palette.error.main, 0.1),
      borderColor: theme.palette.error.main,
    };
  }
  if (d.includes("LEAD")) {
    return {
      color: theme.palette.primary.main,
      icon: "⭐",
      bgColor: alpha(theme.palette.primary.main, 0.1),
      borderColor: theme.palette.primary.main,
    };
  }
  if (d.includes("SENIOR")) {
    return {
      color: theme.palette.success.main,
      icon: "🚀",
      bgColor: alpha(theme.palette.success.main, 0.1),
      borderColor: theme.palette.success.main,
    };
  }
  return {
    color: theme.palette.warning.main,
    icon: "👨‍💻",
    bgColor: alpha(theme.palette.warning.main, 0.1),
    borderColor: theme.palette.warning.main,
  };
};

// Classic CSS "family tree" connector pattern applied via descendant
// selectors on one wrapper — every <ul>/<li> nested inside (however deep the
// recursion) picks up the lines automatically, no per-node line math needed.
export const treeConnectorSx = (theme: Theme) => ({
  "& ul": {
    display: "flex",
    justifyContent: "center",
    m: 0,
    p: 0,
    pt: { xs: "24px", sm: "32px" },
    position: "relative" as const,
  },
  "& li": {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    listStyle: "none",
    position: "relative" as const,
    px: { xs: "6px", sm: "10px" },
    pt: { xs: "24px", sm: "32px" },
  },
  "& li::before, & li::after": {
    content: '""',
    position: "absolute" as const,
    top: 0,
    right: "50%",
    width: "50%",
    height: { xs: "24px", sm: "32px" },
    borderTop: `2px solid ${theme.palette.divider}`,
  },
  "& li::after": {
    right: "auto",
    left: "50%",
    borderLeft: `2px solid ${theme.palette.divider}`,
  },
  "& li:only-child::before, & li:only-child::after": {
    display: "none",
  },
  "& li:only-child": {
    pt: 0,
  },
  "& li:first-of-type::before, & li:last-of-type::after": {
    borderTopColor: "transparent",
  },
  "& li:last-of-type::before": {
    borderRight: `2px solid ${theme.palette.divider}`,
    borderRadius: "0 6px 0 0",
  },
  "& li:first-of-type::after": {
    borderRadius: "6px 0 0 0",
  },
  "& ul ul::before": {
    content: '""',
    position: "absolute" as const,
    top: 0,
    left: "50%",
    width: 0,
    height: { xs: "24px", sm: "32px" },
    borderLeft: `2px solid ${theme.palette.divider}`,
  },
});

export const LARGE_TEAM_THRESHOLD = 8;
