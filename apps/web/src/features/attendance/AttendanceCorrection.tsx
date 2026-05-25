import { memo, useContext, useEffect, useRef, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid2";
import MuiAutocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import AccessTime from "@mui/icons-material/AccessTime";
import Person from "@mui/icons-material/Person";
import Edit from "@mui/icons-material/Edit";
import { useFormik } from "formik";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

type EmployeeOption = { value: string; label: string };

const validationSchema = toFormikValidationSchema(
  z.object({
    userId: z.string().min(1, "Employee is required"),
  }),
);

function AttendanceCorrection() {
  const { setAlert } = useContext(AlertContext);
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = inputValue
          ? `?search=${encodeURIComponent(inputValue)}&limit=20`
          : "?limit=20";
        const res = await apiClient.get(`/get-all-users${params}`);
        const users: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
        setOptions(users.map((u) => ({ value: u.id, label: u.username })));
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  const formik = useFormik({
    initialValues: {
      userId: "",
      timeIn: "",
      timeOut: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.put(API_ENDPOINTS.ATTENDANCE_CORRECTION, {
          userId: values.userId,
          timeIn: values.timeIn,
          timeOut: values.timeOut,
        });
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        formik.resetForm();
        setInputValue("");
        setOptions([]);
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

  const selectedEmployee =
    options.find((o) => o.value === formik.values.userId) ?? null;

  return (
    <Card sx={{ maxWidth: 600, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Edit color="primary" />
          <Typography variant="h6" fontWeight="600">
            Attendance Correction
          </Typography>
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* User Selection */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Person sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Employee
                  </Typography>
                </Box>
                <MuiAutocomplete
                  options={options}
                  getOptionLabel={(o) => o.label ?? ""}
                  filterOptions={(x) => x}
                  value={selectedEmployee}
                  inputValue={inputValue}
                  loading={loading}
                  onInputChange={(_e, val, reason) => {
                    if (reason !== "reset") setInputValue(val);
                  }}
                  onChange={(_e, option) => {
                    formik.setFieldValue("userId", option?.value ?? "");
                    formik.setFieldTouched("userId", true);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Search employee..."
                      size="small"
                      error={
                        formik.touched.userId && Boolean(formik.errors.userId)
                      }
                      helperText={formik.touched.userId && formik.errors.userId}
                      slotProps={{
                        input: {
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {loading && (
                                <CircularProgress color="inherit" size={16} />
                              )}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        },
                      }}
                    />
                  )}
                />
              </Paper>
            </Grid>

            {/* Time Fields */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <AccessTime sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Time Correction
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="time"
                      name="timeIn"
                      placeholder="Time In"
                      formik={formik}
                      inputProps={{ hourFormat: "12" }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="time"
                      name="timeOut"
                      placeholder="Time Out"
                      formik={formik}
                      inputProps={{ showIcon: true, hourFormat: "12" }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Submit */}
            <Grid size={12}>
              <Box display="flex" justifyContent="center">
                <Button
                  type="submit"
                  disabled={formik.isSubmitting}
                  sx={{
                    minWidth: 160,
                    textTransform: "none",
                    fontWeight: "500",
                    ml: 1,
                  }}
                >
                  Update Attendance
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default memo(AttendanceCorrection);
