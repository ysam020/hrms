import React, { useContext } from "react";
import Grid from "@mui/material/Grid2";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../../contexts/UserContext";
import { IconButton } from "@mui/material";
import SchoolIcon from "@mui/icons-material/School";
import PeopleIcon from "@mui/icons-material/People";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AccountBoxIcon from "@mui/icons-material/AccountBox";
import WorkIcon from "@mui/icons-material/Work";
import AssessmentIcon from "@mui/icons-material/Assessment";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import "../../styles/favorites.scss";
import { ThemeContext } from "../../contexts/ThemeContext";

const moduleIcons = {
  "Training And Development": (
    <SchoolIcon sx={{ color: (theme) => theme.iconColor }} />
  ),
  "HR Activities": <PeopleIcon sx={{ color: (theme) => theme.iconColor }} />,
  "Attendance & Leaves": (
    <EventAvailableIcon sx={{ color: (theme) => theme.iconColor }} />
  ),
  "Basic KYC Details": (
    <AccountBoxIcon sx={{ color: (theme) => theme.iconColor }} />
  ),
  "Job Openings": <WorkIcon sx={{ color: (theme) => theme.iconColor }} />,
  "Performance Appraisal": (
    <AssessmentIcon sx={{ color: (theme) => theme.iconColor }} />
  ),
  "Resignation Process": (
    <ExitToAppIcon sx={{ color: (theme) => theme.iconColor }} />
  ),
};

const colorPairs = [
  // [name, lightBg, lightIcon, darkBg, darkIcon]
  ["blue", "#BBDEFB", "#0D47A1", "#1A2A42", "#90CAF9"],
  ["green", "#C8E6C9", "#2E7D32", "#1E3B2D", "#A5D6A7"],
  ["orange", "#FFE0B2", "#E65100", "#3D2A1A", "#FFCC80"],
  ["purple", "#E1BEE7", "#6A1B9A", "#2D1A35", "#CE93D8"],
  ["pink", "#F8BBD0", "#AD1457", "#36192A", "#F48FB1"],
  ["yellow", "#FFF9C4", "#F57F17", "#3D3220", "#FFF59D"],
  ["lavender", "#D1C4E9", "#5E35B1", "#252036", "#B39DDB"],
  ["cyan", "#B2EBF2", "#0097A7", "#1A2E36", "#80DEEA"],
];

// Generate theme-specific color objects
const lightModeColors = colorPairs.map(([name, bg, icon]) => ({ bg, icon }));
const darkModeColors = colorPairs.map(([name, , , bg, icon]) => ({ bg, icon }));

function Favorites() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const favoriteModules = user?.favoriteModules || [];
  const { theme } = useContext(ThemeContext);

  // Choose color palette based on theme
  const moduleColors = theme === "light" ? lightModeColors : darkModeColors;

  return (
    <Grid container columnSpacing={1}>
      {favoriteModules.map(({ name, path }, index) => {
        // Set the icon color for this specific module
        const iconColor = moduleColors[index % moduleColors.length].icon;
        // Clone the icon element to apply the color
        const IconComponent = React.cloneElement(
          moduleIcons[name] || <AssessmentIcon />,
          { sx: { color: iconColor } }
        );

        return (
          <Grid key={index} size={6} sx={{ marginBottom: 0 }}>
            <div
              className="favorite-modules"
              onClick={() => path && navigate(`/${path}`)}
              style={{
                backgroundColor: moduleColors[index % moduleColors.length].bg,
                color: theme === "light" ? "#333" : "#fff", // Text color based on theme
              }}
            >
              <IconButton size="small" sx={{ mr: 1 }}>
                {IconComponent}
              </IconButton>
              <h5 style={{ color: "inherit" }}>{name}</h5>
            </div>
          </Grid>
        );
      })}
    </Grid>
  );
}
export default React.memo(Favorites);
