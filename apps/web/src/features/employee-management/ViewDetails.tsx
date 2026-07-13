import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Grid from "@mui/material/Grid2";
import CircularProgress from "@mui/material/CircularProgress";
import { useState, useContext, lazy, Suspense } from "react";
import { useFormik } from "formik";
import Edit from "@mui/icons-material/Edit";
import Assignment from "@mui/icons-material/Assignment";
import AccountBalance from "@mui/icons-material/AccountBalance";
import Warning from "@mui/icons-material/Warning";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import { useParams, useNavigate } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import { validationSchema } from "./schemas";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

// Lazy load components
const UnAuthorisedRoute = lazy(
  () => import("@web/app/router/UnAuthorisedRoute"),
);

function ViewDetails() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const canEditEmployee =
    user?.isSuperUser ||
    ["owner", "admin"].includes(user?.tenantRole ?? "") ||
    hasPermission(
      "EmployeeManagement",
      "edit",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );

  // Fetch employee data using custom hook
  const { data, loading, error, refetch } = useFetchData(
    `get-employee-details/${username}`,
    "get",
    [username],
    null,
    "Error loading employee details",
  );

  // Real assigned-assets data, sourced from the Assets module (Asset +
  // AssetAssignment) rather than the legacy User.assets free-text field.
  const { data: assignedAssets, loading: assetsLoading } = useFetchData<any[]>(
    data?.id
      ? `/assets?page=1&limit=50&userId=${data.id}&status=assigned`
      : null,
    "get",
    [data?.id],
  );

  const formik = useFormik({
    initialValues: {
      employeeStatus: "",
      pf_no: "",
      uan_no: "",
      esic_no: "",
      reasonForTermination: "",
      dateOfTermination: "",
      dateOfAbscond: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.put(API_ENDPOINTS.EDIT_EMPLOYEE_DETAILS, {
          ...values,
          username,
        });

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });

        setIsEditing(false);
        refetch();
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message || "Something went wrong",
          severity: "error",
        });
      }
    },
  });
  const handleEditClick = () => {
    // Populate formik with current data when entering edit mode
    formik.setValues({
      employeeStatus:
        data?.employeeStatus === "Terminated" ||
        data?.employeeStatus === "Absconded"
          ? data.employeeStatus
          : "Active",
      pf_no: data?.pf_no || "",
      uan_no: data?.uan_no || "",
      esic_no: data?.esic_no || "",
      reasonForTermination: data?.reasonForTermination || "",
      dateOfTermination: data?.dateOfTermination || "",
      dateOfAbscond: data?.dateOfAbscond || "",
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    formik.resetForm();
    setIsEditing(false);
  };

  const getFieldError = (fieldName: string): string | null => {
    const fieldParts = fieldName.split(".");
    let error: any = formik.errors;
    let touched: any = formik.touched;

    for (const part of fieldParts) {
      error = error?.[part];
      touched = touched?.[part];
    }

    return (touched || formik.submitCount > 0) && typeof error === "string"
      ? error
      : null;
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error?.status === 403) {
    return (
      <Suspense
        fallback={
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              p: 4,
            }}
          >
            <CircularProgress size={24} />
          </Box>
        }
      >
        <UnAuthorisedRoute />
      </Suspense>
    );
  }

  return (
    <Card sx={{ maxWidth: 1000, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        {/* Header */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb={2}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <Edit color="primary" />
            <Typography variant="h6" fontWeight="600">
              {isEditing ? "Edit Employee Details" : "Employee Details"}
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Chip
              label={data?.employeeStatus || "Active"}
              size="small"
              color={
                data?.employeeStatus === "Terminated"
                  ? "error"
                  : data?.employeeStatus === "Absconded"
                    ? "warning"
                    : "success"
              }
              variant="outlined"
            />
            {!isEditing ? (
              canEditEmployee && (
                <Button onClick={handleEditClick} style={{ marginTop: 0 }}>
                  Edit
                </Button>
              )
            ) : (
              <Box display="flex" gap={1}>
                <Button onClick={formik.handleSubmit} style={{ marginTop: 0 }}>
                  Save
                </Button>
                <Button onClick={handleCancelEdit} style={{ marginTop: 0 }}>
                  Cancel
                </Button>
              </Box>
            )}
          </Box>
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* Assets — sourced from the Assets module (Asset + AssetAssignment),
                not editable here; assign/return happens in the Assets module
                itself so it goes through the real workflow (condition
                tracking, audit trail, issue reporting). */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  mb={1}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    <Assignment
                      sx={{ fontSize: 18, color: "text.secondary" }}
                    />
                    <Typography variant="subtitle2" fontWeight="500">
                      Assets
                    </Typography>
                  </Box>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => navigate("/assets")}
                    style={{ marginTop: 0 }}
                  >
                    Manage in Assets
                  </Button>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={12}>
                    {assetsLoading ? (
                      <CircularProgress size={16} />
                    ) : assignedAssets && assignedAssets.length > 0 ? (
                      <Box display="flex" flexWrap="wrap" gap={1}>
                        {assignedAssets.map((asset: any) => (
                          <Tooltip
                            key={asset.id}
                            title={`${asset.category} · ${asset.condition} condition`}
                          >
                            <Chip
                              label={`${asset.assetCode} — ${asset.name}`}
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{
                                backgroundColor: "rgba(25, 118, 210, 0.08)",
                                border: "1px solid rgba(25, 118, 210, 0.3)",
                                color: "primary.main",
                                fontWeight: 500,
                              }}
                            />
                          </Tooltip>
                        ))}
                      </Box>
                    ) : (
                      <Chip
                        label="No Assets Allocated"
                        size="small"
                        color="default"
                        variant="outlined"
                        sx={{
                          backgroundColor: "rgba(158, 158, 158, 0.08)",
                          border: "1px solid rgba(158, 158, 158, 0.3)",
                          color: "text.secondary",
                        }}
                      />
                    )}
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Salary Information — the salary structure itself (components,
                gross, advances) is managed solely in Payroll > Salary
                Management; this card shows read-only statutory identifiers. */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  mb={1}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    <AccountBalance
                      sx={{ fontSize: 18, color: "text.secondary" }}
                    />
                    <Typography variant="subtitle2" fontWeight="500">
                      Salary Information
                    </Typography>
                  </Box>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => navigate("/payroll/salary-management")}
                    style={{ marginTop: 0 }}
                  >
                    Manage in Payroll
                  </Button>
                </Box>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mb: 0.5, display: "block" }}
                      >
                        Gross Salary
                      </Typography>
                      <Typography variant="body2">
                        {data?.salary || "--"}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    {isEditing ? (
                      <FormikInputWrapper
                        type="text"
                        name="pf_no"
                        placeholder="PF Number"
                        formik={formik}
                      />
                    ) : (
                      <Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mb: 0.5, display: "block" }}
                        >
                          PF Number
                        </Typography>
                        <Typography variant="body2">
                          {data?.pf_no || "--"}
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    {isEditing ? (
                      <FormikInputWrapper
                        type="text"
                        name="uan_no"
                        placeholder="UAN Number"
                        formik={formik}
                      />
                    ) : (
                      <Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mb: 0.5, display: "block" }}
                        >
                          UAN Number
                        </Typography>
                        <Typography variant="body2">
                          {data?.uan_no || "--"}
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    {isEditing ? (
                      <FormikInputWrapper
                        type="text"
                        name="esic_no"
                        placeholder="ESIC Number"
                        formik={formik}
                      />
                    ) : (
                      <Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mb: 0.5, display: "block" }}
                        >
                          ESIC Number
                        </Typography>
                        <Typography variant="body2">
                          {data?.esic_no || "--"}
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Employee Status */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Warning sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Employee Status
                  </Typography>
                </Box>

                {isEditing ? (
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={
                              formik.values.employeeStatus === "Terminated"
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                formik.setFieldValue(
                                  "employeeStatus",
                                  "Terminated",
                                );
                                formik.setFieldValue(
                                  "dateOfTermination",
                                  new Date().toISOString().split("T")[0],
                                );
                                formik.setFieldValue("dateOfAbscond", "");
                              } else {
                                formik.setFieldValue(
                                  "employeeStatus",
                                  "Active",
                                );
                                formik.setFieldValue("dateOfTermination", "");
                                formik.setFieldValue(
                                  "reasonForTermination",
                                  "",
                                );
                              }
                            }}
                          />
                        }
                        label="Terminate Employee"
                      />
                      {getFieldError("employeeStatus") && (
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{ display: "block", mt: 0.5 }}
                        >
                          {getFieldError("employeeStatus")}
                        </Typography>
                      )}
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={
                              formik.values.employeeStatus === "Absconded"
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                formik.setFieldValue(
                                  "employeeStatus",
                                  "Absconded",
                                );
                                formik.setFieldValue(
                                  "dateOfAbscond",
                                  new Date().toISOString().split("T")[0],
                                );
                                formik.setFieldValue("dateOfTermination", "");
                                formik.setFieldValue(
                                  "reasonForTermination",
                                  "",
                                );
                              } else {
                                formik.setFieldValue(
                                  "employeeStatus",
                                  "Active",
                                );
                                formik.setFieldValue("dateOfAbscond", "");
                              }
                            }}
                          />
                        }
                        label="Mark as Absconded"
                      />
                    </Grid>
                    {formik.values.employeeStatus === "Terminated" && (
                      <Grid size={12}>
                        <FormikInputWrapper
                          type="text"
                          name="reasonForTermination"
                          placeholder="Reason for Termination"
                          formik={formik}
                        />
                      </Grid>
                    )}
                    {formik.values.employeeStatus === "Terminated" &&
                      getFieldError("dateOfTermination") && (
                        <Grid size={12}>
                          <Typography
                            variant="caption"
                            color="error"
                            sx={{ display: "block", mt: 0.5 }}
                          >
                            {getFieldError("dateOfTermination")}
                          </Typography>
                        </Grid>
                      )}
                    {formik.values.employeeStatus === "Absconded" &&
                      getFieldError("dateOfAbscond") && (
                        <Grid size={12}>
                          <Typography
                            variant="caption"
                            color="error"
                            sx={{ display: "block", mt: 0.5 }}
                          >
                            {getFieldError("dateOfAbscond")}
                          </Typography>
                        </Grid>
                      )}
                  </Grid>
                ) : (
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2">
                        <strong>Is Super User:</strong>{" "}
                        {data?.isSuperUser ? "Yes" : "No"}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2">
                        <strong>Terminated:</strong>{" "}
                        {data?.employeeStatus === "Terminated" ? "Yes" : "No"}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2">
                        <strong>Absconded:</strong>{" "}
                        {data?.employeeStatus === "Absconded" ? "Yes" : "No"}
                      </Typography>
                    </Grid>
                    {data?.employeeStatus === "Terminated" && (
                      <Grid size={12}>
                        <Typography variant="body2">
                          <strong>Reason for termination:</strong>{" "}
                          {data?.reasonForTermination}
                        </Typography>
                      </Grid>
                    )}
                    {data?.employeeStatus === "Terminated" &&
                      data?.dateOfTermination && (
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Typography variant="body2">
                            <strong>Date of Termination:</strong>{" "}
                            {new Date(
                              data.dateOfTermination,
                            ).toLocaleDateString()}
                          </Typography>
                        </Grid>
                      )}
                    {data?.employeeStatus === "Absconded" &&
                      data?.dateOfAbscond && (
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Typography variant="body2">
                            <strong>Date of Abscond:</strong>{" "}
                            {new Date(data.dateOfAbscond).toLocaleDateString()}
                          </Typography>
                        </Grid>
                      )}
                  </Grid>
                )}
              </Paper>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default ViewDetails;
