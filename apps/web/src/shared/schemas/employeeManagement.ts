import { z } from "zod";

export const employeeManagementSchema = z
  .object({
    assets: z.array(z.string()).optional(),
    employeeStatus: z
      .enum(["Active", "Terminated", "Absconded"])
      .default("Active"),
    pf_no: z.string().optional(),
    uan_no: z.string().optional(),
    esic_no: z.string().optional(),
    reasonForTermination: z.string().optional(),
    dateOfTermination: z.string().optional(),
    dateOfAbscond: z.string().optional(),
    salary: z.number().min(0, "Gross salary must be a positive number"),
    salaryStructure: z
      .object({
        basicPay: z
          .number()
          .min(0, "Basic pay must be non-negative")
          .nullable()
          .optional(),
        hra: z
          .number()
          .min(0, "HRA must be non-negative")
          .nullable()
          .optional(),
        conveyance: z
          .number()
          .min(0, "Conveyance must be non-negative")
          .nullable()
          .optional(),
        pf: z.number().min(0, "PF must be non-negative").nullable().optional(),
        esi: z
          .number()
          .min(0, "ESI must be non-negative")
          .nullable()
          .optional(),
        pt: z.number().min(0, "PT must be non-negative").nullable().optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.employeeStatus === "Terminated") {
      if (!data.reasonForTermination) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Reason for termination is required",
          path: ["reasonForTermination"],
        });
      }
      if (!data.dateOfTermination) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Date of termination is required",
          path: ["dateOfTermination"],
        });
      }
    }
    if (data.employeeStatus === "Absconded" && !data.dateOfAbscond) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Date of abscond is required",
        path: ["dateOfAbscond"],
      });
    }
    if (data.salaryStructure) {
      const { salaryStructure, salary } = data;
      const fieldLabels: Record<string, string> = {
        basicPay: "Basic Pay",
        hra: "HRA",
        conveyance: "Conveyance",
        pf: "PF",
        esi: "ESI",
        pt: "Professional Tax",
      };
      for (const [key, value] of Object.entries(salaryStructure)) {
        if (value && Number(value) > salary) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${fieldLabels[key] ?? key} cannot be greater than gross salary (₹${salary})`,
            path: ["salaryStructure", key],
          });
        }
      }
      const earnings = ["basicPay", "hra", "conveyance"] as const;
      const totalEarnings = earnings.reduce(
        (sum, k) => sum + (salaryStructure[k] ? Number(salaryStructure[k]) : 0),
        0,
      );
      const hasEarningComponents = earnings.some((k) => salaryStructure[k]);
      if (hasEarningComponents && Math.abs(totalEarnings - salary) > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Total earnings (₹${totalEarnings}) should equal gross salary (₹${salary})`,
          path: ["salaryStructure"],
        });
      }
    }
  });

export type EmployeeManagementFormValues = z.infer<
  typeof employeeManagementSchema
>;
