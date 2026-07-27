import { useContext, useEffect, useState, useMemo } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid2";
import CircularProgress from "@mui/material/CircularProgress";
import AccountBalance from "@mui/icons-material/AccountBalance";
import CalendarToday from "@mui/icons-material/CalendarToday";
import Edit from "@mui/icons-material/Edit";
import Visibility from "@mui/icons-material/Visibility";
import TrendingUp from "@mui/icons-material/TrendingUp";
import { useFormik } from "formik";
import { InputNumber } from "primereact/inputnumber";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { Calendar } from "primereact/calendar";
import Button from "@web/shared/components/Button";
import DataList from "@web/shared/components/DataList";
import { API_ENDPOINTS } from "@web/shared/constants";
import {
  computeSalaryComponents,
  redistributeGross,
  getMergedComponents,
  componentsArrayToValues,
  legacyFieldsToComponentValues,
  type SalaryComponentDef,
  type PtSlab,
} from "@web/shared/utils/salaryCalc";

interface FormValues {
  grossSalary: number;
  components: Record<string, number>;
}

function ViewEditSalaryStructure() {
  const [isEditing, setIsEditing] = useState(false);
  const [currentSalaryData, setCurrentSalaryData] = useState<any>(null);
  const { userId } = useParams();
  const { setAlert } = useContext(AlertContext);

  const [date, setDate] = useState(() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  });

  const maxSelectableDate = (() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  })();

  // Fetch user data including salary structure using custom hook
  const { data: userData, loading } = useFetchData(
    `/get-user-data/${userId}`,
    "get",
    [userId],
    null,
    null,
  );

  // `userData.salary` is the employee's overall/latest salary, not scoped to
  // the "Select Month/Year" period below — only used as a default/proration
  // basis when entering edit mode for a period with no existing structure
  // yet. Anything actually displayed for the selected period must come from
  // `currentSalaryData` instead (see the grossEarnings/netPayable useMemo
  // and the "Amount" column), or it'll silently disagree with whatever
  // period the page is showing — e.g. showing a just-approved raise's gross
  // even while viewing a past month that raise never touched.
  const grossSalary = parseFloat(userData?.salary) || 0;
  const workState = userData?.workState ?? null;

  const [salaryComponents, setSalaryComponents] = useState<
    SalaryComponentDef[]
  >([]);
  const [ptSlabs, setPtSlabs] = useState<PtSlab[]>([]);

  // Load the tenant's configured salary components + PT slabs (seeded with
  // defaults matching the old hardcoded rates on first read).
  useEffect(() => {
    let isMounted = true;
    async function loadComponents() {
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
    loadComponents();
    return () => {
      isMounted = false;
    };
  }, []);

  // Tenant-configured components + the incentive/deductions pseudo-rows —
  // every active component gets an editable row, not just the 6 standard ones.
  const mergedComponents = useMemo(
    () => getMergedComponents(salaryComponents),
    [salaryComponents],
  );

  const formik = useFormik<FormValues>({
    initialValues: {
      grossSalary: 0,
      components: {},
    },
    onSubmit: async (values) => {
      const components = mergedComponents.map((c) => ({
        code: c.code,
        name: c.name,
        type: c.type,
        amount: values.components[c.code] ?? 0,
      }));

      const year = date.split("-")[0];
      const month = date.split("-")[1];

      try {
        const res = await apiClient.post(API_ENDPOINTS.UPDATE_SALARY, {
          userId,
          year,
          month,
          salaryStructure: { components },
        });
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });

        // Update current salary data and exit edit mode
        setCurrentSalaryData(componentsArrayToValues(components));
        setIsEditing(false);
      } catch (error) {
        setAlert({
          open: true,
          message: error.response.data.message,
          severity: "error",
        });
      }
    },
  });

  const basicPay = formik.values.components.BASIC ?? 0;

  // Locked (auto-derived) component codes for the currently-configured
  // tenant components — PF/ESI/PT (and any percent_of_basic component)
  // recompute automatically off Basic/gross while editing.
  const { locked: lockedKeys } = computeSalaryComponents({
    basicPay,
    grossSalary: formik.values.grossSalary,
    components: mergedComponents,
    ptSlabs,
    workState,
  });

  useEffect(() => {
    if (!isEditing) return;
    const { values: derived } = computeSalaryComponents({
      basicPay,
      grossSalary: formik.values.grossSalary,
      components: mergedComponents,
      ptSlabs,
      workState,
    });
    for (const [code, value] of Object.entries(derived)) {
      if (formik.values.components[code] !== value) {
        formik.setFieldValue(`components.${code}`, value);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditing,
    basicPay,
    formik.values.grossSalary,
    mergedComponents,
    ptSlabs,
  ]);

  // Calculate Gross Earnings and Net Payable
  const { grossEarnings, netPayable } = useMemo(() => {
    if (isEditing) {
      let earnings = 0;
      let deductions = 0;
      for (const c of mergedComponents) {
        const amt = formik.values.components[c.code] ?? 0;
        if (c.type === "earning") earnings += amt;
        else deductions += amt;
      }
      return {
        grossEarnings: parseFloat(earnings.toFixed(2)),
        netPayable: parseFloat((earnings - deductions).toFixed(2)),
      };
    } else {
      // In view mode, use current salary data
      return {
        grossEarnings: currentSalaryData?.grossEarnings || 0,
        netPayable: currentSalaryData?.netPayable || 0,
      };
    }
  }, [
    formik.values.components,
    isEditing,
    currentSalaryData,
    mergedComponents,
  ]);

  // Function to get existing salary data for the selected month/year
  const getExistingSalaryData = async () => {
    try {
      const year = date.split("-")[0];
      const month = date.split("-")[1];
      const res = await apiClient(
        API_ENDPOINTS.GET_USER_SALARY(userId!, Number(year), Number(month)),
      );
      if (
        res.data.data &&
        (res.data.data.basicPay !== undefined || res.data.data.salaryStructure)
      ) {
        return res.data.data;
      }
      return null;
    } catch (err) {
      console.error("No existing salary data found:", err);
      return null;
    }
  };

  // Function to calculate salary based on attendance
  const calculateSalaryFromAttendance = async (): Promise<Record<
    string,
    number
  > | null> => {
    try {
      if (!grossSalary) return null;
      const [year, month] = date.split("-");
      const res = await apiClient(
        API_ENDPOINTS.GET_ATTENDANCE_SUMMARY(
          userId!,
          Number(year),
          Number(month),
        ),
      );
      const attendance = res.data.data;

      const totalMonthDays = new Date(Number(year), Number(month), 0).getDate();
      // Same formula as initiatePayrollRun/generateSalarySlip: present + late
      // + halfDays×0.5 + holidays + week offs + WFH + paid leaves.
      const paidDays =
        (attendance.presents || 0) +
        (attendance.late || 0) +
        0.5 * (attendance.halfDays || 0) +
        (attendance.holidays || 0) +
        (attendance.weekOffs || 0) +
        (attendance.wfh || 0) +
        (attendance.paidLeaves || 0);

      const perDaySalary = grossSalary / totalMonthDays;
      const proRataGross = parseFloat((perDaySalary * paidDays).toFixed(2));

      // Basic pay has no tenant-configured rate — it's the base everything
      // else derives from — so we start from a 50% suggestion the admin can
      // adjust, same as before. HRA/Conveyance start blank (there's no real
      // "rate" for them; the old 50%-of-basic split was arbitrary, not a
      // configured value). PF/ESI/PT (and any other tenant-derived
      // component) come from the tenant's configured components/PT slabs
      // instead of a separate hardcoded formula.
      const basic = parseFloat((proRataGross * 0.5).toFixed(2));

      const { values: derived } = computeSalaryComponents({
        basicPay: basic,
        grossSalary: proRataGross,
        components: mergedComponents,
        ptSlabs,
        workState,
      });

      return { BASIC: basic, HRA: 0, CONVEYANCE: 0, ...derived };
    } catch (err) {
      console.error("Error calculating salary from attendance:", err);
      return null;
    }
  };

  const handleEditClick = async () => {
    // Load current month's salary data into formik
    const existingData = await getExistingSalaryData();
    let salaryValues: Record<string, number> | null;

    if (
      existingData &&
      (existingData.basicPay !== undefined || existingData.salaryStructure)
    ) {
      const raw = existingData.salaryStructure || existingData;
      salaryValues = raw.components?.length
        ? componentsArrayToValues(raw.components)
        : legacyFieldsToComponentValues(raw);
    } else {
      // Calculate from attendance if no existing data
      salaryValues = await calculateSalaryFromAttendance();
    }

    if (salaryValues) {
      let earnings = 0;
      for (const c of mergedComponents) {
        if (c.type === "earning") earnings += salaryValues[c.code] ?? 0;
      }
      formik.setValues({ grossSalary: earnings, components: salaryValues });
    }

    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    formik.resetForm();
    setIsEditing(false);
  };

  const handleAmountChange = (
    componentKey: string,
    value: number | null | undefined,
  ) => {
    formik.setFieldValue(`components.${componentKey}`, value ?? 0);
  };

  const handleGrossChange = (value: number | null | undefined) => {
    const newGross = value ?? 0;
    const rescaled = redistributeGross(
      newGross,
      mergedComponents,
      formik.values.components,
      lockedKeys,
    );
    formik.setValues({
      ...formik.values,
      grossSalary: newGross,
      components: rescaled,
    });
  };

  // Load salary data when date or grossSalary changes
  useEffect(() => {
    let isMounted = true;

    const loadSalaryData = async () => {
      if (!grossSalary) return;

      try {
        const existingData = await getExistingSalaryData();

        if (!isMounted) return;

        if (
          existingData &&
          (existingData.basicPay !== undefined || existingData.salaryStructure)
        ) {
          const raw = existingData.salaryStructure || existingData;
          const values = raw.components?.length
            ? componentsArrayToValues(raw.components)
            : legacyFieldsToComponentValues(raw);
          let earnings = 0;
          let deductions = 0;
          for (const c of mergedComponents) {
            const amt = values[c.code] ?? 0;
            if (c.type === "earning") earnings += amt;
            else deductions += amt;
          }
          setCurrentSalaryData({
            ...values,
            grossEarnings: earnings,
            netPayable: earnings - deductions,
          });
        } else {
          // Calculate from attendance if no existing data
          const calculatedValues = await calculateSalaryFromAttendance();
          if (calculatedValues) {
            let earnings = 0;
            let deductions = 0;
            for (const c of mergedComponents) {
              const amt = calculatedValues[c.code] ?? 0;
              if (c.type === "earning") earnings += amt;
              else deductions += amt;
            }
            setCurrentSalaryData({
              ...calculatedValues,
              grossEarnings: earnings,
              netPayable: earnings - deductions,
            });
          }
        }
      } catch (error) {
        console.error("Error loading salary data:", error);
      }
    };

    loadSalaryData();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, grossSalary, userId, mergedComponents]);

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
            {isEditing ? (
              <Edit color="primary" />
            ) : (
              <Visibility color="primary" />
            )}
            <Typography variant="h6" fontWeight="600">
              {isEditing ? "Edit Salary Structure" : "Salary Structure"}
            </Typography>
          </Box>
          <Box display="flex" gap={1} alignItems="center">
            {!isEditing && (
              <Chip
                icon={<AccountBalance />}
                label={`Gross: ₹${grossEarnings}`}
                size="small"
                color="primary"
                clickable
              />
            )}
            <Chip
              icon={<TrendingUp />}
              label={`Net: ₹${netPayable}`}
              size="small"
              color="success"
              clickable
            />
            {!isEditing ? (
              <Button style={{ marginTop: 0 }} onClick={handleEditClick}>
                Edit
              </Button>
            ) : (
              <Box display="flex" gap={1}>
                <Button
                  style={{ marginTop: 0 }}
                  onClick={formik.handleSubmit}
                  disabled={formik.isSubmitting}
                >
                  Save
                </Button>
                <Button style={{ marginTop: 0 }} onClick={handleCancelEdit}>
                  Cancel
                </Button>
              </Box>
            )}
          </Box>
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* Date Selection */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <CalendarToday
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                  <Typography variant="subtitle2" fontWeight="500">
                    Select Month/Year
                  </Typography>
                </Box>
                <Box sx={{ maxWidth: 200 }}>
                  <Calendar
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
                    disabled={isEditing}
                  />
                </Box>
              </Paper>
            </Grid>

            {isEditing && (
              <Grid size={12}>
                <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <AccountBalance
                      sx={{ fontSize: 18, color: "text.secondary" }}
                    />
                    <Typography variant="subtitle2" fontWeight="500">
                      Gross Salary
                    </Typography>
                  </Box>
                  <InputNumber
                    value={formik.values.grossSalary}
                    onValueChange={(e) => handleGrossChange(e.value)}
                    placeholder="0.00"
                    min={0}
                    minFractionDigits={0}
                    maxFractionDigits={2}
                    inputStyle={{
                      padding: "6px 8px",
                      fontSize: "0.875rem",
                      width: "160px",
                    }}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    Changing this proportionally redistributes the earning
                    components below.
                  </Typography>
                </Paper>
              </Grid>
            )}

            {/* Salary Structure Table */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <AccountBalance
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                  <Typography variant="subtitle2" fontWeight="500">
                    Salary Components
                  </Typography>
                </Box>
                <Box sx={{ boxShadow: 1, borderRadius: 1 }}>
                  <DataList
                    ariaLabel="Salary components"
                    variant="rows"
                    data={mergedComponents}
                    getRowId={(component: SalaryComponentDef) => component.code}
                    columns={[
                      {
                        key: "label",
                        label: "Component",
                        primary: true,
                        render: (component: SalaryComponentDef) =>
                          component.name,
                      },
                      {
                        key: "fixedRate",
                        label: "Fixed Rate",
                        render: (component: SalaryComponentDef) =>
                          currentSalaryData?.[component.code] ?? "-",
                      },
                      {
                        key: "amount",
                        label: "Amount",
                        render: (component: SalaryComponentDef) =>
                          isEditing ? (
                            <InputNumber
                              value={
                                formik.values.components[component.code] ?? 0
                              }
                              onValueChange={(e) =>
                                handleAmountChange(component.code, e.value)
                              }
                              onBlur={() =>
                                formik.setFieldTouched(
                                  `components.${component.code}`,
                                  true,
                                )
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
                              disabled={lockedKeys.has(component.code)}
                            />
                          ) : (
                            <Typography
                              variant="body2"
                              sx={{ fontSize: "0.875rem" }}
                            >
                              ₹{currentSalaryData?.[component.code] || "0.00"}
                            </Typography>
                          ),
                      },
                    ]}
                  />
                </Box>

                {/* Summary Row */}
                <Box
                  display="flex"
                  justifyContent="space-between"
                  sx={{
                    mt: 1,
                    p: 1,
                    bgcolor: "background.paper",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body2" fontWeight="600">
                    Gross Earnings: ₹{grossEarnings}
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight="600"
                    color="success.main"
                  >
                    Net Payable: ₹{netPayable}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default ViewEditSalaryStructure;
