import { useContext, useState, useRef, useEffect, useMemo, memo } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid2";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import CalendarToday from "@mui/icons-material/CalendarToday";
import EventNote from "@mui/icons-material/EventNote";
import Info from "@mui/icons-material/Info";
import LocalHospital from "@mui/icons-material/LocalHospital";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { useFormik } from "formik";
import { validationSchema } from "./schemas";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import FormikFileUploadWrapper from "@web/shared/components/FileUploadWrapper";
import DropdownWrapper from "@web/shared/components/DropdownWrapper";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

function LeaveApplication() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const [sickLeave, setIsSickLeave] = useState(false);

  const fileUploadRef = useRef(null);

  // Fetch per-leave-type balances — `balances` is a JSON string keyed by
  // leave type: { [key]: { name, remaining } }, covering every leave type
  // configured in tenant settings (not just Paid Leave).
  const { data: leaveBalanceData } = useFetchData(
    "/get-available-paid-leaves",
    "get",
    [user],
    null,
    null,
  );

  const leaveBalances = useMemo(() => {
    if (!leaveBalanceData?.balances) return [];
    try {
      const parsed = JSON.parse(leaveBalanceData.balances);
      return Object.values(parsed) as { name: string; remaining: number }[];
    } catch {
      return [];
    }
  }, [leaveBalanceData]);

  // Leave types come from the org's configured policy — customLeaveTypes and
  // leavePolicies (Settings → Organisation Settings → Leave) — so a
  // configured type like "Comp Off" or "Maternity" actually shows up here,
  // not just PL/LWP.
  const { data: orgSettingsData } = useFetchData(
    API_ENDPOINTS.GET_ORG_SETTINGS,
    "get",
    [user],
    null,
    null,
  );
  const leaveTypeOptions = useMemo(() => {
    const active = orgSettingsData?.active;
    const seen = new Map<string, string>();
    const add = (value?: string, label?: string) => {
      if (!value) return;
      const key = value.trim().toUpperCase();
      if (!key || seen.has(key)) return;
      seen.set(key, label?.trim() || key);
    };
    add("PL", "Paid Leave");
    add("SL", "Sick Leave");
    add("CL", "Casual Leave");
    // Maternity Leave is a statutory entitlement in India (Maternity Benefit
    // Act) — always offered, not gated behind the tenant configuring it.
    // Paternity is a common policy default alongside it.
    add("MATERNITY", "Maternity Leave");
    add("PATERNITY", "Paternity Leave");
    (active?.customLeaveTypes ?? []).forEach((t: any) => add(t.key, t.name));
    (active?.leavePolicies ?? []).forEach((p: any) =>
      add(p.key, p.isCompOff ? `${p.name} (Comp Off)` : p.name),
    );
    add("LWP", "Leave Without Pay");
    return Array.from(seen.entries()).map(([value, label]) => ({
      label,
      value,
    }));
  }, [orgSettingsData]);

  const formik = useFormik({
    initialValues: {
      from: "",
      to: "",
      reason: "",
      leaveType: "",
      sick_leave: false,
      medicalCertificate: "",
      unit: "full_day",
      session: "",
      shortLeaveHours: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const payload = {
          ...values,
          shortLeaveHours: values.shortLeaveHours
            ? Number(values.shortLeaveHours)
            : undefined,
        };
        const res = await apiClient.post(API_ENDPOINTS.ADD_LEAVE, payload);
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        formik.resetForm();
        setIsSickLeave(false);
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response.data.message,
          severity: "error",
        });
      }
    },
  });

  // Half-day and short leave only ever span a single day — keep "to" in
  // lockstep with "from" so the backend's single-day validation always holds.
  useEffect(() => {
    if (formik.values.unit !== "full_day" && formik.values.from) {
      formik.setFieldValue("to", formik.values.from);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formik.values.unit, formik.values.from]);

  const handleSickLeaveChange = (event) => {
    const checked = event.target.checked;
    setIsSickLeave(checked);
    formik.setFieldValue("sick_leave", checked);

    // Clear medical certificate if unchecked
    if (!checked) {
      formik.setFieldValue("medicalCertificate", "");
    }
  };

  return (
    <Card sx={{ maxWidth: 800, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        {/* Header */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb={2}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <EventNote color="primary" />
            <Typography variant="h6" fontWeight="600">
              Leave Application
            </Typography>
          </Box>
          <Box
            display="flex"
            flexWrap="wrap"
            gap={0.75}
            justifyContent="flex-end"
          >
            {leaveBalances.length === 0 ? (
              <Chip
                icon={<Info />}
                label="0 leave(s) available"
                size="small"
                color="primary"
                variant="outlined"
              />
            ) : (
              leaveBalances.map((b) => (
                <Chip
                  key={b.name}
                  icon={<Info />}
                  label={`${b.name}: ${b.remaining}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              ))
            )}
          </Box>
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* Date Fields */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <CalendarToday
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                  <Typography variant="subtitle2" fontWeight="500">
                    Leave Duration
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <DropdownWrapper
                      name="unit"
                      options={[
                        { label: "Full day", value: "full_day" },
                        { label: "Half day", value: "half_day" },
                        { label: "Short leave (hours)", value: "short_leave" },
                      ]}
                      placeholder="Unit"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="date"
                      name="from"
                      placeholder="Start Date"
                      formik={formik}
                      inputProps={{
                        minDate: new Date(),
                        dateFormat: "dd/mm/yy",
                        showIcon: true,
                        showButtonBar: true,
                      }}
                    />
                  </Grid>
                  {formik.values.unit === "full_day" ? (
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <FormikInputWrapper
                        type="date"
                        name="to"
                        placeholder="End Date"
                        formik={formik}
                        inputProps={{
                          minDate: new Date(),
                          dateFormat: "dd/mm/yy",
                          showIcon: true,
                          showButtonBar: true,
                        }}
                      />
                    </Grid>
                  ) : (
                    <Grid
                      size={{ xs: 12, sm: 4 }}
                      sx={{ display: "flex", alignItems: "center" }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Same day as Start Date
                      </Typography>
                    </Grid>
                  )}

                  {formik.values.unit === "half_day" && (
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <DropdownWrapper
                        name="session"
                        options={[
                          { label: "First half", value: "first_half" },
                          { label: "Second half", value: "second_half" },
                        ]}
                        placeholder="Which half?"
                        formik={formik}
                      />
                    </Grid>
                  )}
                  {formik.values.unit === "short_leave" && (
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        label="Hours"
                        slotProps={{
                          htmlInput: { min: 0.5, max: 7, step: 0.5 },
                        }}
                        value={formik.values.shortLeaveHours}
                        onChange={(e) =>
                          formik.setFieldValue(
                            "shortLeaveHours",
                            e.target.value,
                          )
                        }
                      />
                    </Grid>
                  )}
                </Grid>
              </Paper>
            </Grid>

            {/* Leave Details */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <EventNote sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Details
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <FormikInputWrapper
                      type="text"
                      name="reason"
                      placeholder="Reason for leave (min 5 characters)"
                      formik={formik}
                    />
                    <Typography
                      variant="caption"
                      color={
                        formik.values.reason.length < 5
                          ? "text.secondary"
                          : "success.main"
                      }
                      sx={{ display: "block", textAlign: "right", mt: 0.5 }}
                    >
                      {formik.values.reason.length} character
                      {formik.values.reason.length !== 1 ? "s" : ""}
                      {formik.values.reason.length < 5 ? " (5 minimum)" : ""}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <DropdownWrapper
                      name="leaveType"
                      options={leaveTypeOptions}
                      placeholder="Leave Type"
                      formik={formik}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Sick Leave Section */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <LocalHospital
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                  <Typography variant="subtitle2" fontWeight="500">
                    Medical Information
                  </Typography>
                </Box>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={sickLeave}
                      onChange={handleSickLeaveChange}
                      name="sickLeave"
                      color="primary"
                    />
                  }
                  label="This is a sick leave"
                  sx={{ mb: sickLeave ? 1.5 : 0 }}
                />

                {/* Conditional File Upload */}
                {sickLeave && (
                  <Grid container spacing={1.5}>
                    <Grid size={12}>
                      <FormikFileUploadWrapper
                        name="medicalCertificate"
                        folderName="leave_medical_certificates"
                        label="Medical Certificate"
                        formik={formik}
                        fileUploadRef={fileUploadRef}
                        accept="image/*,application/pdf"
                        setFileSnackbar={(uploaded: boolean) => {
                          if (uploaded)
                            setAlert({
                              open: true,
                              message:
                                "Medical certificate uploaded successfully!",
                              severity: "success",
                            });
                        }}
                        username={user?.username}
                      />
                    </Grid>
                  </Grid>
                )}
              </Paper>
            </Grid>

            {/* Submit */}
            <Grid size={12}>
              <Box display="flex" justifyContent="center">
                <Button
                  type="submit"
                  disabled={formik.isSubmitting}
                  loading={formik.isSubmitting}
                  loadingText="Submitting..."
                >
                  Submit Application
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default memo(LeaveApplication);
