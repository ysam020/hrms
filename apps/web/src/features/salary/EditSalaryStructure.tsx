import { useContext, useEffect, useState, useMemo } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
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
import { salaryComponents } from "@web/assets/data/salaryComponents";
import { AlertContext } from "@web/app/providers/AlertContext";
import { Calendar } from "primereact/calendar";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

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

  const grossSalary = parseFloat(userData?.salary) || 0;
  const fixedStructure = userData?.salaryStructure || {};

  // Filter salary components
  const getFilteredSalaryComponents = () => {
    const additionalComponents = [
      { key: "incentive", label: "Incentive" },
      { key: "deductions", label: "Deductions" },
    ];

    return [...salaryComponents, ...additionalComponents];
  };

  const formik = useFormik({
    initialValues: {
      salaryStructure: {
        basicPay: 0,
        hra: 0,
        conveyance: 0,
        incentive: 0,
        pf: 0,
        esi: 0,
        pt: 0,
        deductions: 0,
      },
    },
    onSubmit: async (values) => {
      const salaryValues = values.salaryStructure;
      const basicPay = salaryValues.basicPay;
      const hra = salaryValues.hra;
      const conveyance = salaryValues.conveyance;
      const incentive = salaryValues.incentive;
      const deductions = salaryValues.deductions;
      const pf = salaryValues.pf;
      const pt = salaryValues.pt;
      const esi = salaryValues.esi;

      const calculatedGrossEarnings = basicPay + hra + conveyance + incentive;
      const calculatedNetPayable =
        calculatedGrossEarnings - pf - pt - esi - deductions;

      const year = date.split("-")[0];
      const month = date.split("-")[1];

      const submissionData = {
        ...values,
        salaryStructure: {
          ...values.salaryStructure,
          grossEarnings: parseFloat(calculatedGrossEarnings.toFixed(2)),
          netPayable: parseFloat(calculatedNetPayable.toFixed(2)),
        },
        userId,
        year,
        month,
      };

      try {
        const res = await apiClient.post(
          API_ENDPOINTS.UPDATE_SALARY,
          submissionData,
        );
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });

        // Update current salary data and exit edit mode
        setCurrentSalaryData(submissionData.salaryStructure);
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

  // Calculate Gross Earnings and Net Payable
  const { grossEarnings, netPayable } = useMemo(() => {
    if (isEditing) {
      const values = formik.values.salaryStructure;

      const basicPay = values.basicPay;
      const hra = values.hra;
      const conveyance = values.conveyance;
      const incentive = values.incentive;
      const deductions = values.deductions;
      const pf = values.pf;
      const pt = values.pt;
      const esi = values.esi;

      const grossEarnings = basicPay + hra + conveyance + incentive;
      const netPayable = grossEarnings - pf - pt - esi - deductions;

      return {
        grossEarnings: parseFloat(grossEarnings.toFixed(2)),
        netPayable: parseFloat(netPayable.toFixed(2)),
      };
    } else {
      // In view mode, use current salary data
      return {
        grossEarnings: currentSalaryData?.grossEarnings || 0,
        netPayable: currentSalaryData?.netPayable || 0,
      };
    }
  }, [formik.values.salaryStructure, isEditing, currentSalaryData]);

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
  const calculateSalaryFromAttendance = async () => {
    try {
      if (!grossSalary) return;
      const [year, month] = date.split("-");
      const res = await apiClient(
        API_ENDPOINTS.GET_ATTENDANCE_SUMMARY(
          userId!,
          Number(year),
          Number(month),
        ),
      );
      const attendance = res.data;

      const totalMonthDays = new Date(Number(year), Number(month), 0).getDate();
      const paidDays =
        (attendance.presents || 0) +
        0.5 * (attendance.halfDays || 0) +
        (attendance.holidays || 0) +
        (attendance.paidLeaves || 0);

      const perDaySalary = grossSalary / totalMonthDays;
      const proRataGross = parseFloat((perDaySalary * paidDays).toFixed(2));

      const basicPay = parseFloat((proRataGross * 0.5).toFixed(2));
      const hra = parseFloat((basicPay * 0.5).toFixed(2));
      const conveyance = parseFloat((basicPay * 0.5).toFixed(2));

      let pf = 0;
      let pt = 0;
      let esi = 0;

      pf = parseFloat((basicPay * 0.12).toFixed(2));

      if (proRataGross <= 5999) {
        pt = 0;
      } else if (proRataGross >= 6000 && proRataGross <= 8999) {
        pt = 80;
      } else if (proRataGross >= 9000 && proRataGross <= 11999) {
        pt = 150;
      } else if (proRataGross >= 12000) {
        pt = 200;
      }

      esi =
        proRataGross <= 21000
          ? parseFloat((proRataGross * 0.0175).toFixed(2))
          : 0;

      const calculatedStructure = {
        basicPay,
        hra,
        conveyance,
        incentive: 0,
        deductions: 0,
        pf,
        pt,
        esi,
        grossEarnings: basicPay + hra + conveyance,
        netPayable: basicPay + hra + conveyance - pf - pt - esi,
      };

      return calculatedStructure;
    } catch (err) {
      console.error("Error calculating salary from attendance:", err);
      return null;
    }
  };

  const handleEditClick = async () => {
    // Load current month's salary data into formik
    const existingData = await getExistingSalaryData();
    let salaryData;

    if (
      existingData &&
      (existingData.basicPay !== undefined || existingData.salaryStructure)
    ) {
      salaryData = existingData.salaryStructure || existingData;
    } else {
      // Calculate from attendance if no existing data
      salaryData = await calculateSalaryFromAttendance();
    }

    if (salaryData) {
      formik.setValues({
        salaryStructure: {
          basicPay: salaryData.basicPay ?? 0,
          hra: salaryData.hra ?? 0,
          conveyance: salaryData.conveyance ?? 0,
          incentive: salaryData.incentive ?? 0,
          pf: salaryData.pf ?? 0,
          esi: salaryData.esi ?? 0,
          pt: salaryData.pt ?? 0,
          deductions: salaryData.deductions ?? 0,
        },
      });
    }

    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    formik.resetForm();
    setIsEditing(false);
  };

  const handleAmountChange = (componentKey, value) => {
    formik.setFieldValue(`salaryStructure.${componentKey}`, value ?? 0);
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
          const salaryData = existingData.salaryStructure || existingData;
          setCurrentSalaryData(salaryData);
        } else {
          // Calculate from attendance if no existing data
          const calculatedData = await calculateSalaryFromAttendance();
          if (calculatedData) {
            setCurrentSalaryData(calculatedData);
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
  }, [date, grossSalary, userId]);

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

  const updatedSalaryComponents = getFilteredSalaryComponents();

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
            <Chip
              icon={<AccountBalance />}
              label={`Gross: ₹${grossSalary}`}
              size="small"
              color="primary"
              clickable
            />
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
                <TableContainer component={Paper} sx={{ boxShadow: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "background.paper" }}>
                        <TableCell
                          sx={{ fontWeight: "600", fontSize: "0.875rem" }}
                        >
                          Component
                        </TableCell>
                        <TableCell
                          sx={{ fontWeight: "600", fontSize: "0.875rem" }}
                        >
                          Fixed Rate
                        </TableCell>
                        <TableCell
                          sx={{ fontWeight: "600", fontSize: "0.875rem" }}
                        >
                          Amount
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {updatedSalaryComponents.map((component) => (
                        <TableRow key={component.key} hover={isEditing}>
                          <TableCell
                            sx={{ fontWeight: 500, fontSize: "0.875rem" }}
                          >
                            {component.label}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: "0.875rem",
                              color: "text.secondary",
                            }}
                          >
                            {fixedStructure?.[component.key] ?? "-"}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <InputNumber
                                value={
                                  formik.values.salaryStructure[component.key]
                                }
                                onValueChange={(e) =>
                                  handleAmountChange(component.key, e.value)
                                }
                                onBlur={() =>
                                  formik.setFieldTouched(
                                    `salaryStructure.${component.key}`,
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
                              />
                            ) : (
                              <Typography
                                variant="body2"
                                sx={{ fontSize: "0.875rem" }}
                              >
                                ₹{currentSalaryData?.[component.key] || "0.00"}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

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
                    Gross Salary: ₹{grossSalary}
                  </Typography>
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
