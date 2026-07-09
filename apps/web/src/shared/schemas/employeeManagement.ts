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
    employmentType: z.enum(["employee", "contractor"]).optional(),
    workState: z.string().nullable().optional(),
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
  });

export type EmployeeManagementFormValues = z.infer<
  typeof employeeManagementSchema
>;
