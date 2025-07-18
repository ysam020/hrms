import { useFormik } from "formik";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import { InputNumber } from "primereact/inputnumber";
import CustomButton from "../../customComponents/CustomButton";
// import { validationSchema } from "../../../schemas/employeeManagementSchema";
import apiClient from "../../../config/axiosConfig";
import { useParams } from "react-router-dom";
import { salaryComponents } from "../../../assets/data/salaryComponents";
import { useContext, useEffect, useState, useMemo } from "react";
import { AlertContext } from "../../../contexts/AlertContext";
import { Calendar } from "primereact/calendar";

function EditSalaryStructure() {
  const [grossSalary, setGrossSalary] = useState(0);
  const [fixedStructure, setFixedStructure] = useState({});
  const [companyName, setCompanyName] = useState("");
  const { username } = useParams();
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

  // Function to determine if deductions should be calculated/shown
  const shouldShowDeductions = () => {
    return companyName === "Paymaster Management Solutions Limited";
  };

  // Filter salary components based on company
  const getFilteredSalaryComponents = () => {
    const additionalComponents = [
      { key: "incentive", label: "Incentive" },
      { key: "deductions", label: "Deductions" },
    ];

    if (shouldShowDeductions()) {
      return [...salaryComponents, ...additionalComponents];
    } else {
      // Filter out PF, ESI, PT for "Paymaster" company
      const filteredBasicComponents = salaryComponents.filter(
        (component) => !["pf", "esi", "pt"].includes(component.key)
      );
      return [...filteredBasicComponents, ...additionalComponents];
    }
  };

  const formik = useFormik({
    initialValues: {
      salaryStructure: {
        basicPay: "",
        hra: "",
        conveyance: "",
        incentive: "",
        pf: "",
        esi: "",
        pt: "",
        deductions: "",
      },
    },
    // validationSchema,
    onSubmit: async (values) => {
      // Calculate the latest grossEarnings and netPayable
      const salaryValues = values.salaryStructure;
      const basicPay = parseFloat(salaryValues.basicPay || 0);
      const hra = parseFloat(salaryValues.hra || 0);
      const conveyance = parseFloat(salaryValues.conveyance || 0);
      const incentive = parseFloat(salaryValues.incentive || 0);
      const deductions = parseFloat(salaryValues.deductions || 0);

      // Only include deductions if company requires them
      const pf = shouldShowDeductions() ? parseFloat(salaryValues.pf || 0) : 0;
      const pt = shouldShowDeductions() ? parseFloat(salaryValues.pt || 0) : 0;
      const esi = shouldShowDeductions()
        ? parseFloat(salaryValues.esi || 0)
        : 0;

      const calculatedGrossEarnings = basicPay + hra + conveyance + incentive;
      const calculatedNetPayable =
        calculatedGrossEarnings - pf - pt - esi - deductions;

      const year = date.split("-")[0];
      const month = date.split("-")[1];

      // Include calculated values in submission
      const submissionData = {
        ...values,
        salaryStructure: {
          ...values.salaryStructure,
          grossEarnings: parseFloat(calculatedGrossEarnings.toFixed(2)),
          netPayable: parseFloat(calculatedNetPayable.toFixed(2)),
          // Set deduction fields to 0 if company doesn't require them
          ...(shouldShowDeductions() ? {} : { pf: 0, pt: 0, esi: 0 }),
        },
        username,
        year,
        month,
      };

      try {
        const res = await apiClient.post("/update-salary", submissionData);

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
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
    const values = formik.values.salaryStructure;

    // Convert values to numbers, defaulting to 0 if empty or invalid
    const basicPay = parseFloat(values.basicPay || 0);
    const hra = parseFloat(values.hra || 0);
    const conveyance = parseFloat(values.conveyance || 0);
    const incentive = parseFloat(values.incentive || 0);
    const deductions = parseFloat(values.deductions || 0);

    // Only include deductions if company requires them
    const pf = shouldShowDeductions() ? parseFloat(values.pf || 0) : 0;
    const pt = shouldShowDeductions() ? parseFloat(values.pt || 0) : 0;
    const esi = shouldShowDeductions() ? parseFloat(values.esi || 0) : 0;

    // Calculate gross earnings
    const grossEarnings = basicPay + hra + conveyance + incentive;

    // Calculate net payable
    const netPayable = grossEarnings - pf - pt - esi - deductions;

    return {
      grossEarnings: parseFloat(grossEarnings.toFixed(2)),
      netPayable: parseFloat(netPayable.toFixed(2)),
    };
  }, [formik.values.salaryStructure, companyName]);

  // Function to get existing salary data for the selected month/year
  const getExistingSalaryData = async () => {
    try {
      const year = date.split("-")[0];
      const month = date.split("-")[1];
      const res = await apiClient(
        `/get-user-salary/${username}/${year}/${month}`
      );

      // Check if res.data has salary structure properties directly
      if (
        res.data &&
        (res.data.basicPay !== undefined || res.data.salaryStructure)
      ) {
        return res.data;
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
      if (!grossSalary) return; // wait for salary to load
      const [year, month] = date.split("-");
      const res = await apiClient(
        `/get-attendance-summary/${username}/${year}/${month}`
      );
      const attendance = res.data;

      const totalMonthDays = new Date(year, month, 0).getDate(); // days in month
      // Calculate paid days from attendance summary
      const paidDays =
        (attendance.presents || 0) +
        0.5 * (attendance.halfDays || 0) +
        (attendance.holidays || 0) +
        (attendance.paidLeaves || 0);

      // Calculate per day salary based on gross salary
      const perDaySalary = grossSalary / totalMonthDays;

      // Calculate gross salary for paid days
      const proRataGross = parseFloat((perDaySalary * paidDays).toFixed(2));

      // Apply salary component logic:
      // basic = 50% of pro-rata gross
      const basicPay = parseFloat((proRataGross * 0.5).toFixed(2));
      // hra = 50% of basic
      const hra = parseFloat((basicPay * 0.5).toFixed(2));
      // conveyance fixed (you can customize this or fetch from original data)
      const conveyance = parseFloat((basicPay * 0.5).toFixed(2));

      // Initialize deduction variables
      let pf = 0;
      let pt = 0;
      let esi = 0;

      // Only calculate deductions if company requires them
      if (shouldShowDeductions()) {
        // pf = 12% of basic
        pf = parseFloat((basicPay * 0.12).toFixed(2));

        // pt calculation
        if (proRataGross <= 5999) {
          pt = 0;
        } else if (proRataGross >= 6000 && proRataGross <= 8999) {
          pt = 80;
        } else if (proRataGross >= 9000 && proRataGross <= 11999) {
          pt = 150;
        } else if (proRataGross >= 12000) {
          pt = 200;
        }

        // esi (example rule: only if gross <= 21000)
        esi =
          proRataGross <= 21000
            ? parseFloat((proRataGross * 0.0175).toFixed(2))
            : 0;
      }

      // Compose updated structure
      const updatedStructure = {
        basicPay,
        hra,
        conveyance,
        incentive: 0,
        deductions: 0,
        pf,
        pt,
        esi,
      };

      // Update formik values
      formik.setValues((prev) => ({
        ...prev,
        salaryStructure: updatedStructure,
      }));
    } catch (err) {
      console.error("Error calculating salary from attendance:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function getSalaryStructure() {
      try {
        const res = await apiClient(`/get-user-data/${username}`);
        const structure = res.data.salaryStructure;

        // Only update state if component is still mounted
        if (isMounted) {
          // Set company name from API response
          setCompanyName(res.data.companyName || "");
          setGrossSalary(parseFloat(res.data.salary) || 0);

          if (structure) {
            setFixedStructure(structure);
            formik.setValues((prev) => ({
              ...prev,
              salaryStructure: {
                ...prev.salaryStructure,
                ...structure,
              },
            }));
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    getSalaryStructure();

    return () => {
      isMounted = false;
    };
  }, [username]);

  // Updated useEffect to handle priority logic
  useEffect(() => {
    let isMounted = true;

    const loadSalaryData = async () => {
      if (!grossSalary) return; // wait for salary to load

      try {
        // First, try to get existing salary data
        const existingData = await getExistingSalaryData();

        // Only proceed if component is still mounted
        if (!isMounted) return;

        if (
          existingData &&
          (existingData.basicPay !== undefined || existingData.salaryStructure)
        ) {
          // Handle both direct properties and nested salaryStructure
          const salaryData = existingData.salaryStructure || existingData;

          // Only update formik if component is still mounted
          if (isMounted) {
            formik.setValues((prev) => ({
              ...prev,
              salaryStructure: {
                ...prev.salaryStructure,
                ...salaryData,
              },
            }));
          }
        } else {
          // If no existing data, fallback to attendance calculation
          // Only proceed if component is still mounted
          if (isMounted) {
            await calculateSalaryFromAttendance();
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
  }, [date, grossSalary, username, companyName]);

  const updatedSalaryComponents = getFilteredSalaryComponents();

  const handleAmountChange = (componentKey, value) => {
    formik.setFieldValue(`salaryStructure.${componentKey}`, value || "");
  };

  return (
    <Box>
      <form onSubmit={formik.handleSubmit}>
        <br />
        <Grid container spacing={1}>
          <Grid size={{ xs: 4, sm: 4, md: 4, lg: 4 }}>
            <Calendar
              value={date ? new Date(date + "-01") : null}
              onChange={(e) => {
                if (e.value) {
                  const year = e.value.getFullYear();
                  const month = String(e.value.getMonth() + 1).padStart(2, "0");
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
          </Grid>
        </Grid>

        <TableContainer
          component={Paper}
          sx={{
            maxWidth: 1000,
            mb: 2,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            borderRadius: 2,
            p: 1,
          }}
        >
          <Table
            size="small"
            sx={{
              "& .MuiTableCell-root": { padding: "4px 8px" },
              "& tbody tr:last-child td": {
                borderBottom: "none",
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    fontWeight: "bold",
                    minWidth: 120,
                    fontSize: "0.875rem",
                  }}
                >
                  Component
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: "bold",
                    minWidth: 150,
                    fontSize: "0.875rem",
                  }}
                >
                  Fixed Rate
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: "bold",
                    minWidth: 150,
                    fontSize: "0.875rem",
                  }}
                >
                  Amount
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {updatedSalaryComponents.map((component) => (
                <TableRow key={component.key}>
                  <TableCell sx={{ fontWeight: 500, fontSize: ".875rem" }}>
                    {component.label}
                  </TableCell>
                  <TableCell sx={{ fontSize: ".875rem" }}>
                    {fixedStructure?.[component.key] ?? "-"}
                  </TableCell>
                  <TableCell>
                    <InputNumber
                      value={formik.values.salaryStructure[component.key]}
                      onValueChange={(e) =>
                        handleAmountChange(component.key, e.value)
                      }
                      onBlur={() =>
                        formik.setFieldTouched(
                          `salaryStructure.${component.key}`,
                          true
                        )
                      }
                      placeholder="Enter amount"
                      min={0}
                      minFractionDigits={0}
                      maxFractionDigits={2}
                      inputStyle={{ padding: "8px", fontSize: "0.875rem" }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell sx={{ fontSize: "1rem", fontWeight: "bold" }}>
                  Gross Salary: ₹{grossSalary}
                </TableCell>
                <TableCell sx={{ fontSize: "1rem", fontWeight: "bold" }}>
                  Gross Earnings: ₹{grossEarnings}
                </TableCell>
                <TableCell sx={{ fontSize: "1rem", fontWeight: "bold" }}>
                  Net Payable: ₹{netPayable}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
      </form>
    </Box>
  );
}

export default EditSalaryStructure;
