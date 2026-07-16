import { Suspense, lazy } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid2";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import FenceIcon from "@mui/icons-material/Fence";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import { numField } from "@web/shared/components/numField";
import type { LocationValue } from "@web/shared/components/LocationPicker";
import type { SectionProps } from "./types";

const LocationPicker = lazy(
  () => import("@web/shared/components/LocationPicker"),
);

export function GeofencingSection({
  settings,
  onChange,
  readOnly,
}: SectionProps) {
  return (
    <Box>
      <Divider sx={{ my: 3 }} />

      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 1,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <HomeWorkIcon fontSize="small" color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>
              Work From Home
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Allow employees to submit WFH requests. When disabled, the WFH
            module is hidden across the app for everyone in this organisation.
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={settings.wfhEnabled}
              onChange={(e) =>
                !readOnly && onChange({ wfhEnabled: e.target.checked })
              }
              disabled={readOnly}
              color="primary"
            />
          }
          label={
            <Typography variant="body2" fontWeight={500}>
              {settings.wfhEnabled ? "Enabled" : "Disabled"}
            </Typography>
          }
          labelPlacement="start"
        />
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 1,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <FenceIcon fontSize="small" color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>
              Geofencing
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Require employees to punch in from within a set radius of the
            office. Employees marked as <strong>Work From Home</strong> are
            validated against their registered home address instead.
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={settings.geofencingEnabled}
              onChange={(e) =>
                !readOnly && onChange({ geofencingEnabled: e.target.checked })
              }
              disabled={readOnly}
              color="primary"
            />
          }
          label={
            <Typography variant="body2" fontWeight={500}>
              {settings.geofencingEnabled ? "Enabled" : "Disabled"}
            </Typography>
          }
          labelPlacement="start"
        />
      </Box>

      {settings.geofencingEnabled && (
        <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Radius */}
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 4 }}>
              {numField(
                "Allowed radius",
                settings.geofenceRadiusMeters,
                (v) => onChange({ geofenceRadiusMeters: Math.max(50, v) }),
                {
                  min: 50,
                  suffix: "m",
                  helperText: "Min 50 m — applies to both office and WFH",
                  disabled: readOnly,
                },
              )}
            </Grid>
          </Grid>

          {/* Office location picker */}
          <Box>
            <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
              Office location
            </Typography>
            <Suspense
              fallback={
                <Box
                  sx={{
                    height: 320,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  <CircularProgress size={28} />
                </Box>
              }
            >
              <LocationPicker
                lat={settings.officeLatitude}
                lng={settings.officeLongitude}
                name={settings.officeName}
                disabled={readOnly}
                onChange={(v: LocationValue) =>
                  onChange({
                    officeLatitude: v.lat,
                    officeLongitude: v.lng,
                    officeName: v.name,
                  })
                }
              />
            </Suspense>
          </Box>

          {!readOnly &&
            (settings.officeLatitude == null ||
              settings.officeLongitude == null) && (
              <Alert severity="warning">
                Set the office location above — employees won't be able to check
                in until geofencing is configured with a valid location.
              </Alert>
            )}
        </Box>
      )}
    </Box>
  );
}
