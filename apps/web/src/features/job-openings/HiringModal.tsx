import { memo, useContext, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import { AlertContext } from "@web/app/providers/AlertContext";
import { useFormik } from "formik";
import { InputNumber } from "primereact/inputnumber";
import apiClient from "@web/core/http/axiosConfig";
import { hiringValidationSchema as validationSchema } from "./schemas";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import Button from "@web/shared/components/Button";
import CustomModal from "@web/shared/components/Modal";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import { useParams } from "react-router-dom";
import { API_ENDPOINTS } from "@web/shared/constants";
import {
  computeSalaryComponents,
  redistributeGross,
  getMergedComponents,
  type SalaryComponentDef,
  type PtSlab,
} from "@web/shared/utils/salaryCalc";

function HiringModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { name, email, aadharNo } = props.applicantData || {};
  const { _id } = useParams();

  const [salaryComponents, setSalaryComponents] = useState<
    SalaryComponentDef[]
  >([]);
  const [ptSlabs, setPtSlabs] = useState<PtSlab[]>([]);

  // Load the tenant's configured salary components + PT slabs — same call
  // EditSalaryStructure.tsx makes, so hiring uses the exact same component
  // set (and derived-value rules) as post-hire salary editing.
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
    if (props.open) loadComponents();
    return () => {
      isMounted = false;
    };
  }, [props.open]);

  const mergedComponents = useMemo(
    () => getMergedComponents(salaryComponents),
    [salaryComponents],
  );

  const formik = useFormik({
    initialValues: {
      grossSalary: 0,
      components: {} as Record<string, number>,
      joining_date: "",
      reference_by: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      const components = mergedComponents.map((c) => ({
        code: c.code,
        name: c.name,
        type: c.type,
        amount: values.components[c.code] ?? 0,
      }));

      const data = {
        components,
        joining_date: values.joining_date,
        reference_by: values.reference_by,
        aadharNo,
        jobTitle: props.jobTitle,
        email,
        name,
        id: props.applicantData.id,
      };

      try {
        const res = await apiClient.put(API_ENDPOINTS.HIRE_CANDIDATE, {
          ...data,
          jobId: _id,
        });
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        props.getJobApplications && props.getJobApplications();
        props.handleClose();
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message || "An error occurred",
          severity: "error",
        });
      }
    },
  });

  const basicPay = formik.values.components.BASIC ?? 0;

  const { locked: lockedKeys } = computeSalaryComponents({
    basicPay,
    grossSalary: formik.values.grossSalary,
    components: mergedComponents,
    ptSlabs,
    workState: null,
  });

  useEffect(() => {
    const { values: derived } = computeSalaryComponents({
      basicPay,
      grossSalary: formik.values.grossSalary,
      components: mergedComponents,
      ptSlabs,
      workState: null,
    });
    for (const [code, value] of Object.entries(derived)) {
      if (formik.values.components[code] !== value) {
        formik.setFieldValue(`components.${code}`, value);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basicPay, formik.values.grossSalary, mergedComponents, ptSlabs]);

  const handleGrossChange = (value: number | null | undefined) => {
    const newGross = value ?? 0;
    const rescaled = redistributeGross(
      newGross,
      mergedComponents,
      formik.values.components,
      lockedKeys,
      ptSlabs,
      null,
    );
    formik.setValues({
      ...formik.values,
      grossSalary: newGross,
      components: rescaled,
    });
  };

  const handleAmountChange = (
    componentKey: string,
    value: number | null | undefined,
  ) => {
    formik.setFieldValue(`components.${componentKey}`, value ?? 0);
  };

  const modalStyle = {
    width: { xs: "95%", sm: 720 },
  };

  return (
    <CustomModal
      open={props.open}
      handleClose={props.handleClose}
      modalStyle={modalStyle}
      disablePortal
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
          pb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: "success.main",
              color: "white",
            }}
          >
            <CheckCircleIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem" }}
            >
              Hire Candidate
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {props.jobTitle}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Candidate Info */}
      <Box sx={{ p: 2.5, pb: 1.5 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Candidate Information
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            icon={<PersonIcon />}
            label={name || "N/A"}
            variant="outlined"
            size="small"
          />
          <Chip
            icon={<EmailIcon />}
            label={email || "N/A"}
            variant="outlined"
            size="small"
          />
        </Stack>
      </Box>

      {/* Form */}
      <Box sx={{ p: 2.5, pt: 0 }}>
        <form onSubmit={formik.handleSubmit}>
          <Stack spacing={1}>
            <FormikInputWrapper
              type="date"
              name="joining_date"
              placeholder="Joining Date"
              formik={formik}
              inputProps={{
                minDate: new Date(),
                dateFormat: "dd/mm/yy",
                showIcon: true,
                showButtonBar: true,
                // appendTo:"self" gets clipped by this modal's overflow:auto
                // Paper — InputWrapper's type="date" default already appends
                // to the app root to escape it, so don't override it here.
              }}
            />

            <FormikInputWrapper
              type="text"
              name="reference_by"
              placeholder="Reference By (Optional)"
              formik={formik}
            />

            <Paper
              variant="outlined"
              sx={{ p: 1.5, bgcolor: "background.default" }}
            >
              <Typography variant="subtitle2" fontWeight={500} sx={{ mb: 1 }}>
                Monthly Gross Salary
              </Typography>
              <InputNumber
                value={formik.values.grossSalary}
                onValueChange={(e) => handleGrossChange(e.value)}
                placeholder="Monthly Gross Salary"
                min={0}
                minFractionDigits={0}
                maxFractionDigits={2}
                style={{ width: "100%", maxWidth: 260 }}
                inputStyle={{
                  padding: "6px 8px",
                  fontSize: "0.875rem",
                  width: "100%",
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

            <Paper
              variant="outlined"
              sx={{ p: 1.5, bgcolor: "background.default" }}
            >
              <Typography variant="subtitle2" fontWeight={500} sx={{ mb: 1 }}>
                Salary Components
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  columnGap: 2,
                  rowGap: 1.5,
                }}
              >
                {mergedComponents.map((component) => (
                  <Box key={component.code}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mb: 0.5 }}
                    >
                      {component.name}
                    </Typography>
                    <InputNumber
                      aria-label={component.name}
                      value={formik.values.components[component.code] ?? 0}
                      onValueChange={(e) =>
                        handleAmountChange(component.code, e.value)
                      }
                      placeholder="0.00"
                      min={0}
                      minFractionDigits={0}
                      maxFractionDigits={2}
                      style={{ width: "100%" }}
                      inputStyle={{
                        padding: "6px 8px",
                        fontSize: "0.875rem",
                        width: "100%",
                      }}
                      disabled={lockedKeys.has(component.code)}
                    />
                  </Box>
                ))}
              </Box>
            </Paper>

            <Button type="submit" disabled={formik.isSubmitting}>
              Hire Candidate
            </Button>
          </Stack>
        </form>
      </Box>
    </CustomModal>
  );
}

export default memo(HiringModal);
