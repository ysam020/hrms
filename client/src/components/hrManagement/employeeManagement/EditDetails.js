import { useFormik } from "formik";
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import { MultiSelect } from "primereact/multiselect";
import CustomButton from "../../customComponents/CustomButton";
import { validationSchema } from "../../../schemas/employeeManagementSchema";
import apiClient from "../../../config/axiosConfig";
import { useParams } from "react-router-dom";
import { assets } from "../../../assets/data/companyAssets";
import { useContext } from "react";
import { AlertContext } from "../../../contexts/AlertContext";
import Grid from "@mui/material/Grid2";
import { InputNumber } from "primereact/inputnumber";
import { salaryComponents } from "../../../assets/data/salaryComponents";
import { useEffect, useState } from "react";
import DropdownWrapper from "../../customComponents/DropdownWrapper";

function EditDetails() {
  const { username } = useParams();
  const { setAlert } = useContext(AlertContext);
  const [company, setCompany] = useState("");

  // Function to determine if deductions should be shown
  const shouldShowDeductions = () => {
    return company === "Paymaster Management Solutions Limited";
  };

  // Filter salary components based on company
  const getFilteredSalaryComponents = () => {
    if (shouldShowDeductions()) {
      return salaryComponents; // Show all components including PF, ESI, PT
    } else {
      // Filter out PF, ESI, PT for "Paymaster" company
      return salaryComponents.filter(
        (component) => !["pf", "esi", "pt"].includes(component.key)
      );
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function getGrossSalary() {
      try {
        const res = await apiClient(`/get-user-data/${username}`);
        const data = res.data;

        // Only update state if component is still mounted
        if (isMounted) {
          // Set company name from API response
          setCompany(data.company || "");

          formik.setValues((prev) => ({
            ...prev,
            grossSalary: data.salary || "",
            pf_no: data.pf_no || "",
            uan_no: data.uan_no || "",
            esic_no: data.esic_no || "",
            employeeStatus: data.employeeStatus || "",
            reasonForTermination: data.reasonForTermination || "",
            dateOfTermination: data.dateOfTermination || "",
            dateOfAbscond: data.dateOfAbscond || "",
            assets: data.assets || [],
            salaryStructure: {
              ...data.salaryStructure,
            },
          }));
        }
      } catch (error) {
        console.error(
          "Error occurred while fetching gross salary data:",
          error
        );
      }
    }

    getGrossSalary();

    return () => {
      isMounted = false;
    };
  }, [username]);

  const formik = useFormik({
    initialValues: {
      assets: [],
      company: "",
      employeeStatus: "",
      pf_no: "",
      uan_no: "",
      esic_no: "",
      grossSalary: "",
      salaryStructure: {
        basicPay: "",
        hra: "",
        conveyance: "",
        pf: "",
        esi: "",
        pt: "",
      },
      reasonForTermination: "",
      dateOfTermination: "",
      dateOfAbscond: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.post(`/edit-employee-details`, {
          ...values,
          username,
        });

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
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

  // Function to handle gross salary changes
  const handleGrossSalaryChange = (value) => {
    formik.setFieldValue("grossSalary", value || "");

    // Auto-calculate ESI when gross salary changes (if basic pay exists and deductions are enabled)
    if (
      value &&
      formik.values.salaryStructure.basicPay &&
      shouldShowDeductions()
    ) {
      const esiAmount = Math.round(value * 0.0075);
      formik.setFieldValue(`salaryStructure.esi`, esiAmount);
    }
  };

  const handleAmountChange = (componentKey, value) => {
    formik.setFieldValue(`salaryStructure.${componentKey}`, value || "");

    // Auto-calculate based on basic pay entry (only if deductions are enabled)
    if (componentKey === "basicPay" && value && shouldShowDeductions()) {
      // Calculate PF as 12% of basic pay
      const pfAmount = Math.round(value * 0.12);
      formik.setFieldValue(`salaryStructure.pf`, pfAmount);

      // Calculate ESI as 0.75% of gross salary (if gross salary exists)
      if (formik.values.grossSalary > 0) {
        const esiAmount = Math.round(formik.values.grossSalary * 0.0075);
        formik.setFieldValue(`salaryStructure.esi`, esiAmount);
      }

      // Set PT as 200
      formik.setFieldValue(`salaryStructure.pt`, 200);
    }
  };

  const filteredSalaryComponents = getFilteredSalaryComponents();

  return (
    <Box>
      <form onSubmit={formik.handleSubmit}>
        {/* Assets Section */}
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Assets Allocation
        </Typography>

        <MultiSelect
          value={formik.values.assets}
          options={assets.map((a) => ({ label: a, value: a }))}
          onChange={(e) => formik.setFieldValue("assets", e.value)}
          onBlur={() => formik.setFieldTouched("assets", true)}
          display="chip"
          placeholder="Select Assets"
          style={{ marginBottom: "1rem" }}
        />

        <Grid container spacing={1}>
          <Grid size={3}>
            <InputNumber
              value={formik.values.grossSalary}
              onValueChange={(e) => handleGrossSalaryChange(e.value)}
              onBlur={() => formik.setFieldTouched("grossSalary", true)}
              placeholder="Enter amount"
              min={0}
              minFractionDigits={0}
              maxFractionDigits={2}
            />
            {formik.touched.grossSalary && formik.errors.grossSalary && (
              <Typography
                variant="caption"
                color="error"
                sx={{ display: "block", mt: 0.5 }}
              >
                {formik.errors.grossSalary}
              </Typography>
            )}
          </Grid>

          {/* Only show PF, UAN, ESIC fields if deductions are enabled */}
          {shouldShowDeductions() && (
            <>
              <Grid size={3}>
                <FormikInputWrapper
                  type="text"
                  name="pf_no"
                  placeholder="PF Number"
                  formik={formik}
                />
              </Grid>
              <Grid size={3}>
                <FormikInputWrapper
                  type="text"
                  name="uan_no"
                  placeholder="UAN Number"
                  formik={formik}
                />
              </Grid>
              <Grid size={3}>
                <FormikInputWrapper
                  type="text"
                  name="esic_no"
                  placeholder="ESIC Number"
                  formik={formik}
                />
              </Grid>
            </>
          )}
        </Grid>

        <Grid container spacing={1}>
          <Grid size={6}>
            <DropdownWrapper
              name={"company"}
              options={[
                { label: "Paymaster", value: "Paymaster" },
                {
                  label: "Paymaster Management Solutions Limited",
                  value: "Paymaster Management Solutions Limited",
                },
              ]}
              placeholder={"Company"}
              formik={formik}
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
                  Amount
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSalaryComponents.map((component) => (
                <TableRow key={component.key}>
                  <TableCell sx={{ fontWeight: 500, fontSize: ".875rem" }}>
                    {component.label}
                  </TableCell>
                  <TableCell>
                    {component.key === "pf" ||
                    component.key === "esi" ||
                    component.key === "pt" ? (
                      // Read-only display for auto-calculated fields
                      <InputNumber
                        value={
                          formik.values.salaryStructure[component.key] || "-"
                        }
                        placeholder="Enter amount"
                        min={0}
                        minFractionDigits={0}
                        maxFractionDigits={2}
                        inputStyle={{ padding: "8px", fontSize: "0.875rem" }}
                        disabled
                      />
                    ) : (
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
                    )}
                    {formik.touched.salaryStructure?.[component.key] &&
                      formik.errors.salaryStructure?.[component.key] && (
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{ display: "block", mt: 0.5 }}
                        >
                          {formik.errors.salaryStructure[component.key]}
                        </Typography>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Terminated Section */}
        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                id="employeeStatus"
                name="employeeStatus"
                checked={formik.values.employeeStatus === "Terminated"}
                onChange={(e) => {
                  if (e.target.checked) {
                    formik.setFieldValue("employeeStatus", "Terminated");
                    formik.setFieldValue(
                      "dateOfTermination",
                      new Date().toISOString().split("T")[0]
                    );
                    formik.setFieldValue("dateOfAbscond", "");
                  } else {
                    formik.setFieldValue("employeeStatus", "Active");
                    formik.setFieldValue("dateOfTermination", "");
                    formik.setFieldValue("reasonForTermination", "");
                  }
                }}
              />
            }
            label={"Terminate Employee"}
          />
          {formik.values.employeeStatus === "Terminated" && (
            <FormikInputWrapper
              type="text"
              name="reasonForTermination"
              placeholder="Reason for Termination"
              formik={formik}
            />
          )}
        </Box>

        {/* Abscond Section */}
        <Box
          className="flex-div"
          sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}
        >
          <FormControlLabel
            control={
              <Checkbox
                id="employeeStatus"
                name="employeeStatus"
                checked={formik.values.employeeStatus === "Absconded"}
                onChange={(e) => {
                  if (e.target.checked) {
                    formik.setFieldValue("employeeStatus", "Absconded");
                    formik.setFieldValue(
                      "dateOfAbscond",
                      new Date().toISOString().split("T")[0]
                    );
                    formik.setFieldValue("dateOfTermination", "");
                    formik.setFieldValue("reasonForTermination", "");
                  } else {
                    formik.setFieldValue("employeeStatus", "Active");
                    formik.setFieldValue("dateOfAbscond", "");
                  }
                }}
              />
            }
            label={"Absconded"}
          />
        </Box>

        <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
      </form>
    </Box>
  );
}

export default EditDetails;
