import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid2";
import CircularProgress from "@mui/material/CircularProgress";
import { useEffect, useState, useContext, lazy, Suspense } from "react";
import { useFormik } from "formik";
import Edit from "@mui/icons-material/Edit";
import Assignment from "@mui/icons-material/Assignment";
import AccountBalance from "@mui/icons-material/AccountBalance";
import Business from "@mui/icons-material/Business";
import Warning from "@mui/icons-material/Warning";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { Calendar } from "primereact/calendar";
import { MultiSelect } from "primereact/multiselect";
import { InputNumber } from "primereact/inputnumber";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import DropdownWrapper from "@web/shared/components/DropdownWrapper";
import DataList from "@web/shared/components/DataList";
import { validationSchema } from "./schemas";
import { assets } from "@web/assets/data/companyAssets";
import Button from "@web/shared/components/Button";
import downloadSalarySlip from "@web/shared/utils/downloadSalarySlip";
import { API_ENDPOINTS } from "@web/shared/constants";
import {
  computeSalaryComponents,
  CODE_TO_KEY,
  type SalaryComponentDef,
  type PtSlab,
} from "@web/shared/utils/salaryCalc";

// Lazy load components
const UnAuthorisedRoute = lazy(
  () => import("@web/app/router/UnAuthorisedRoute"),
);
const LocationPicker = lazy(
  () => import("@web/shared/components/LocationPicker"),
);

function ViewDetails() {
  const { username } = useParams();
  const [isEditing, setIsEditing] = useState(false);
  const { setAlert } = useContext(AlertContext);

  const [date, setDate] = useState(() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [salaryComponents, setSalaryComponents] = useState<
    SalaryComponentDef[]
  >([]);
  const [ptSlabs, setPtSlabs] = useState<PtSlab[]>([]);
  const [isEditingSalary, setIsEditingSalary] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);

  // Fetch employee data using custom hook
  const { data, loading, error, refetch } = useFetchData(
    `get-employee-details/${username}`,
    "get",
    [username],
    null,
    "Error loading employee details",
  );

  const maxSelectableDate = (() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  })();

  const formik = useFormik({
    initialValues: {
      assets: [] as any[],
      employeeStatus: "",
      pf_no: "",
      uan_no: "",
      esic_no: "",
      reasonForTermination: "",
      dateOfTermination: "",
      dateOfAbscond: "",
      wfh: false,
      wfhHomeLatitude: null as number | null,
      wfhHomeLongitude: null as number | null,
      wfhHomeName: null as string | null,
      employmentType: "employee" as "employee" | "contractor",
      workState: null as string | null,
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
  // Separate formik + save action for the Salary Structure card — it writes
  // through UPDATE_SALARY (salary-service's SalaryStructure, same endpoint
  // EditSalaryStructure.tsx uses) instead of EDIT_EMPLOYEE_DETAILS, so
  // User.salary* has exactly one writer instead of two independently
  // drifting ones.
  const salaryFormik = useFormik({
    initialValues: {
      basicPay: 0,
      hra: 0,
      conveyance: 0,
      pf: 0,
      esi: 0,
      pt: 0,
    },
    onSubmit: async (values) => {
      setSavingSalary(true);
      try {
        const now = new Date();
        const res = await apiClient.put(API_ENDPOINTS.UPDATE_SALARY, {
          userId: data?.id,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          salaryStructure: values,
        });
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        setIsEditingSalary(false);
        refetch();
      } catch (err: any) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message || "Something went wrong",
          severity: "error",
        });
      } finally {
        setSavingSalary(false);
      }
    },
  });

  // Locked (auto-derived) component keys for the currently-configured
  // tenant components — recomputed whenever basic pay or the earnings that
  // feed gross salary change while editing.
  const derivedGross =
    Number(salaryFormik.values.basicPay || 0) +
    Number(salaryFormik.values.hra || 0) +
    Number(salaryFormik.values.conveyance || 0);
  const { locked: lockedSalaryKeys } = computeSalaryComponents({
    basicPay: Number(salaryFormik.values.basicPay || 0),
    grossSalary: derivedGross,
    components: salaryComponents,
    ptSlabs,
    workState: data?.workState ?? null,
  });

  useEffect(() => {
    if (!isEditingSalary) return;
    const { values: derived } = computeSalaryComponents({
      basicPay: Number(salaryFormik.values.basicPay || 0),
      grossSalary: derivedGross,
      components: salaryComponents,
      ptSlabs,
      workState: formik.values.workState,
    });
    for (const [key, value] of Object.entries(derived)) {
      if (salaryFormik.values[key as keyof typeof salaryFormik.values] !== value) {
        salaryFormik.setFieldValue(key, value);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditingSalary,
    salaryFormik.values.basicPay,
    salaryFormik.values.hra,
    salaryFormik.values.conveyance,
    salaryComponents,
    ptSlabs,
  ]);

  const handleAmountChange = (
    componentKey: string,
    value: number | null | undefined,
  ) => {
    salaryFormik.setFieldValue(componentKey, value ?? 0);
  };

  const handleEditSalaryClick = () => {
    salaryFormik.setValues({
      basicPay:
        data?.salaryStructure?.basicPay != null
          ? Number(data.salaryStructure.basicPay)
          : 0,
      hra:
        data?.salaryStructure?.hra != null
          ? Number(data.salaryStructure.hra)
          : 0,
      conveyance:
        data?.salaryStructure?.conveyance != null
          ? Number(data.salaryStructure.conveyance)
          : 0,
      pf:
        data?.salaryStructure?.pf != null
          ? Number(data.salaryStructure.pf)
          : 0,
      esi:
        data?.salaryStructure?.esi != null
          ? Number(data.salaryStructure.esi)
          : 0,
      pt:
        data?.salaryStructure?.pt != null
          ? Number(data.salaryStructure.pt)
          : 0,
    });
    setIsEditingSalary(true);
  };

  const handleCancelSalaryEdit = () => {
    salaryFormik.resetForm();
    setIsEditingSalary(false);
  };

  const handleEditClick = () => {
    // Populate formik with current data when entering edit mode
    formik.setValues({
      assets: data?.assets || [],
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
      wfh: data?.wfh || false,
      wfhHomeLatitude: data?.wfhHomeLatitude ?? null,
      wfhHomeLongitude: data?.wfhHomeLongitude ?? null,
      wfhHomeName: data?.wfhHomeName ?? null,
      employmentType:
        data?.employmentType === "contractor" ? "contractor" : "employee",
      workState: data?.workState ?? null,
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

  // Load the tenant's configured salary components + PT slabs (seeded with
  // defaults matching the old hardcoded rates on first read — see
  // listSalaryComponents in the api-gateway).
  useEffect(() => {
    let isMounted = true;

    async function loadSalaryComponents() {
      try {
        const [componentsRes, slabsRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.LIST_SALARY_COMPONENTS),
          apiClient.get(API_ENDPOINTS.LIST_PT_SLABS),
        ]);
        if (isMounted) {
          setSalaryComponents(componentsRes.data?.data ?? []);
          setPtSlabs(slabsRes.data?.data ?? []);
        }
      } catch (error) {
        console.error("Error loading salary components:", error);
      }
    }

    loadSalaryComponents();

    return () => {
      isMounted = false;
    };
  }, []);

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
              <Button onClick={handleEditClick} style={{ marginTop: 0 }}>
                Edit
              </Button>
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
            {/* Assets */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Assignment sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Assets
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={12}>
                    {isEditing ? (
                      <>
                        <MultiSelect
                          value={formik.values.assets}
                          options={assets.map((a) => ({ label: a, value: a }))}
                          onChange={(e) =>
                            formik.setFieldValue("assets", e.value)
                          }
                          onBlur={() => formik.setFieldTouched("assets", true)}
                          display="chip"
                          placeholder="Select Assets"
                          style={{ width: "100%" }}
                        />
                        {getFieldError("assets") && (
                          <Typography
                            variant="caption"
                            color="error"
                            sx={{ display: "block", mt: 0.5 }}
                          >
                            {getFieldError("assets")}
                          </Typography>
                        )}
                      </>
                    ) : (
                      <Box>
                        {data?.assets && data.assets.length > 0 ? (
                          <Box display="flex" flexWrap="wrap" gap={1}>
                            {data.assets.map((asset, index) => (
                              <Chip
                                key={index}
                                label={asset}
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
                      </Box>
                    )}
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Salary Information */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <AccountBalance
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                  <Typography variant="subtitle2" fontWeight="500">
                    Salary Information
                  </Typography>
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
                  <Grid size={{ xs: 12, sm: 3 }}>
                    {isEditing ? (
                      <DropdownWrapper
                        name="employmentType"
                        options={[
                          { label: "Employee", value: "employee" },
                          { label: "Contractor", value: "contractor" },
                        ]}
                        placeholder="Employment Type"
                        formik={formik}
                      />
                    ) : (
                      <Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mb: 0.5, display: "block" }}
                        >
                          Employment Type
                        </Typography>
                        <Typography variant="body2">
                          {data?.employmentType === "contractor"
                            ? "Contractor"
                            : "Employee"}
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    {isEditing ? (
                      <FormikInputWrapper
                        type="text"
                        name="workState"
                        placeholder="Work State (for Professional Tax)"
                        formik={formik}
                      />
                    ) : (
                      <Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mb: 0.5, display: "block" }}
                        >
                          Work State
                        </Typography>
                        <Typography variant="body2">
                          {data?.workState || "--"}
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Salary Structure */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  mb={1}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    <Business sx={{ fontSize: 18, color: "text.secondary" }} />
                    <Typography variant="subtitle2" fontWeight="500">
                      Salary Structure
                    </Typography>
                  </Box>
                  {!isEditingSalary ? (
                    <Button
                      onClick={handleEditSalaryClick}
                      style={{ marginTop: 0 }}
                    >
                      Edit
                    </Button>
                  ) : (
                    <Box display="flex" gap={1}>
                      <Button
                        onClick={salaryFormik.handleSubmit}
                        disabled={savingSalary}
                        style={{ marginTop: 0 }}
                      >
                        {savingSalary ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        onClick={handleCancelSalaryEdit}
                        style={{ marginTop: 0 }}
                      >
                        Cancel
                      </Button>
                    </Box>
                  )}
                </Box>
                <Box
                  sx={{
                    boxShadow: isEditingSalary
                      ? 1
                      : "0 4px 12px rgba(0, 0, 0, 0.1)",
                    borderRadius: 2,
                  }}
                >
                  <DataList
                    ariaLabel="Salary structure"
                    variant="rows"
                    data={salaryComponents.filter((c) => CODE_TO_KEY[c.code])}
                    getRowId={(component: SalaryComponentDef) => component.id}
                    columns={[
                      {
                        key: "name",
                        label: "Component",
                        primary: true,
                        render: (component: SalaryComponentDef) =>
                          component.name,
                      },
                      {
                        key: "amount",
                        label: "Amount",
                        render: (component: SalaryComponentDef) => {
                          const key = CODE_TO_KEY[component.code];
                          return isEditingSalary ? (
                            <InputNumber
                              value={
                                salaryFormik.values[
                                  key as keyof typeof salaryFormik.values
                                ]
                              }
                              onValueChange={(e) =>
                                handleAmountChange(key, e.value)
                              }
                              placeholder="0.00"
                              min={0}
                              minFractionDigits={0}
                              maxFractionDigits={2}
                              inputStyle={{
                                padding: "6px 8px",
                                fontSize: "0.875rem",
                                width: "120px",
                              }}
                              disabled={lockedSalaryKeys.has(key)}
                            />
                          ) : (
                            (data?.salaryStructure?.[key] ?? "--")
                          );
                        },
                      },
                    ]}
                  />
                </Box>
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
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={formik.values.wfh}
                            onChange={(e) => {
                              formik.setFieldValue("wfh", e.target.checked);
                              // Clear home location when WFH is disabled
                              if (!e.target.checked) {
                                formik.setFieldValue("wfhHomeLatitude", null);
                                formik.setFieldValue("wfhHomeLongitude", null);
                                formik.setFieldValue("wfhHomeName", null);
                              }
                            }}
                          />
                        }
                        label="Work from Home"
                      />
                      {getFieldError("wfh") && (
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{ display: "block", mt: 0.5 }}
                        >
                          {getFieldError("wfh")}
                        </Typography>
                      )}
                    </Grid>
                    {/* Home location picker — shown when WFH is enabled */}
                    {formik.values.wfh && (
                      <Grid size={12}>
                        <Box
                          sx={{
                            mt: 1,
                            p: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1,
                            bgcolor: "background.paper",
                          }}
                        >
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            sx={{ mb: 1 }}
                          >
                            Employee's home location (used for geofencing)
                          </Typography>
                          <Suspense
                            fallback={
                              <Box
                                sx={{
                                  height: 280,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  border: "1px solid",
                                  borderColor: "divider",
                                  borderRadius: 1,
                                }}
                              >
                                <CircularProgress size={24} />
                              </Box>
                            }
                          >
                            <LocationPicker
                              lat={formik.values.wfhHomeLatitude}
                              lng={formik.values.wfhHomeLongitude}
                              name={formik.values.wfhHomeName}
                              height={280}
                              onChange={(v) => {
                                formik.setFieldValue("wfhHomeLatitude", v.lat);
                                formik.setFieldValue("wfhHomeLongitude", v.lng);
                                formik.setFieldValue("wfhHomeName", v.name);
                              }}
                            />
                          </Suspense>
                        </Box>
                      </Grid>
                    )}
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
                        <strong>Work from Home:</strong>{" "}
                        {data?.wfh ? "Yes" : "No"}
                      </Typography>
                      {data?.wfh && data?.wfhHomeName && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mt: 0.25 }}
                        >
                          📍{" "}
                          {data.wfhHomeName.length > 60
                            ? data.wfhHomeName.slice(0, 60) + "…"
                            : data.wfhHomeName}
                        </Typography>
                      )}
                      {data?.wfh &&
                        !data?.wfhHomeName &&
                        data?.wfhHomeLatitude && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.25 }}
                          >
                            📍 {data.wfhHomeLatitude?.toFixed(5)},{" "}
                            {data.wfhHomeLongitude?.toFixed(5)}
                          </Typography>
                        )}
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

            {/* Download Salary Slip - Only show in view mode */}
            {!isEditing && (
              <Grid size={12}>
                <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                  <Typography
                    variant="subtitle2"
                    fontWeight="500"
                    sx={{ mb: 1 }}
                  >
                    Download Salary Slip
                  </Typography>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Calendar
                      appendTo={() =>
                        document.querySelector("#root .App") as HTMLElement
                      }
                      value={date ? new Date(date + "-01") : null}
                      onChange={(e) => {
                        if (e.value) {
                          const year = e.value.getFullYear();
                          const month = String(e.value.getMonth() + 1).padStart(
                            2,
                            "0",
                          );
                          setDate(`${year}-${month}`);
                        } else {
                          setDate("");
                        }
                      }}
                      view="month"
                      dateFormat="mm/yy"
                      maxDate={maxSelectableDate}
                      showIcon
                    />
                    <Button
                      onClick={() =>
                        downloadSalarySlip(
                          date,
                          username,
                          setIsDownloading,
                          setAlert,
                        )
                      }
                      disabled={isDownloading}
                      style={{ marginTop: 0 }}
                    >
                      {isDownloading ? "Downloading..." : "Download"}
                    </Button>
                  </Box>
                </Paper>
              </Grid>
            )}
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default ViewDetails;
