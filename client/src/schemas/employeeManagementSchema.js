import * as Yup from "yup";

export const validationSchema = Yup.object().shape({
  assets: Yup.array().of(Yup.string()),

  employeeStatus: Yup.string()
    .oneOf(["Active", "Terminated", "Absconded"], "Invalid employee status")
    .default("Active"),

  pf_no: Yup.string(),
  uan_no: Yup.string(),
  esic_no: Yup.string(),

  reasonForTermination: Yup.string().when("employeeStatus", {
    is: "Terminated",
    then: (schema) => schema.required("Reason for termination is required"),
    otherwise: (schema) => schema.notRequired(),
  }),

  dateOfTermination: Yup.string().when("employeeStatus", {
    is: "Terminated",
    then: (schema) => schema.required("Date of termination is required"),
    otherwise: (schema) => schema.notRequired(),
  }),

  dateOfAbscond: Yup.string().when("employeeStatus", {
    is: "Absconded",
    then: (schema) => schema.required("Date of abscond is required"),
    otherwise: (schema) => schema.notRequired(),
  }),

  // Gross salary validation
  grossSalary: Yup.number()
    .required("Gross salary is required")
    .min(0, "Gross salary must be a positive number"),

  // Salary structure validations - matching your form structure
  salaryStructure: Yup.object()
    .shape({
      basicPay: Yup.number()
        .min(0, "Basic pay must be non-negative")
        .nullable(),
      hra: Yup.number().min(0, "HRA must be non-negative").nullable(),
      conveyance: Yup.number()
        .min(0, "Conveyance must be non-negative")
        .nullable(),
      pf: Yup.number().min(0, "PF must be non-negative").nullable(),
      esi: Yup.number().min(0, "ESI must be non-negative").nullable(),
      pt: Yup.number().min(0, "PT must be non-negative").nullable(),
    })
    .test(
      "no-component-greater-than-gross",
      "No salary component should be greater than gross salary",
      function (salaryStructure) {
        const { grossSalary } = this.parent;

        if (!grossSalary || !salaryStructure) return true;

        // Map field keys to user-friendly names
        const fieldLabels = {
          basicPay: "Basic Pay",
          hra: "HRA",
          conveyance: "Conveyance",
          pf: "PF",
          esi: "ESI",
          pt: "Professional Tax",
        };

        // Check each component against gross salary
        for (const [key, value] of Object.entries(salaryStructure)) {
          if (value && Number(value) > grossSalary) {
            const fieldLabel = fieldLabels[key] || key;
            return this.createError({
              path: `salaryStructure.${key}`,
              message: `${fieldLabel} cannot be greater than gross salary (₹${grossSalary})`,
            });
          }
        }
        return true;
      }
    )
    .test(
      "components-sum-validation",
      "Sum of salary components should equal gross salary",
      function (salaryStructure) {
        const { grossSalary } = this.parent;

        if (!grossSalary || !salaryStructure) return true;

        // Calculate sum of all positive components (earnings)
        const earnings = ["basicPay", "hra", "conveyance"];

        const totalEarnings = earnings.reduce((sum, key) => {
          const value = salaryStructure[key];
          return sum + (value ? Number(value) : 0);
        }, 0);

        // If any earning components are filled, check if they sum to gross salary
        const hasEarningComponents = earnings.some(
          (key) => salaryStructure[key]
        );

        if (hasEarningComponents) {
          // Allow small floating-point errors
          if (Math.abs(totalEarnings - grossSalary) > 0.01) {
            return this.createError({
              path: "salaryStructure",
              message: `Total earnings (₹${totalEarnings}) should equal gross salary (₹${grossSalary})`,
            });
          }
        }

        return true;
      }
    ),
});
