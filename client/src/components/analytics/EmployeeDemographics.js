import React from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid2";
import EmployeeDepartments from "./EmployeeDepartments";
import EmployeeDesignations from "./EmployeeDesignations";
import AgeDistribution from "./AgeDistribution";
import JoiningInfo from "./JoiningInfo";
import ErrorFallback from "../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import "../../styles/dashboard.scss";
import { ThemeContext } from "../../contexts/ThemeContext";

function EmployeeDemographics() {
  const { theme } = React.useContext(ThemeContext);
  return (
    <Box sx={{ flexGrow: 1, paddingTop: 0 }} className="dashboard">
      <Grid container spacing={1}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ErrorBoundary fallback={<ErrorFallback />}>
            <EmployeeDepartments theme={theme} />
          </ErrorBoundary>
        </Grid>
        <Grid size={6}>
          <ErrorBoundary fallback={<ErrorFallback />}>
            <AgeDistribution theme={theme} />
          </ErrorBoundary>
        </Grid>
      </Grid>

      <Grid container>
        <Grid size={{ xs: 12, md: 12 }}>
          <ErrorBoundary fallback={<ErrorFallback />}>
            <EmployeeDesignations theme={theme} />
          </ErrorBoundary>
        </Grid>
      </Grid>

      <Grid container>
        <Grid size={{ xs: 12, md: 12 }}>
          <ErrorBoundary fallback={<ErrorFallback />}>
            <JoiningInfo theme={theme} />
          </ErrorBoundary>
        </Grid>
      </Grid>
    </Box>
  );
}

export default React.memo(EmployeeDemographics);
