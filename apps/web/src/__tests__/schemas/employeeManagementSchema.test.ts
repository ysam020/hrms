import { employeeManagementSchema } from "@web/shared/schemas/employeeManagement";

const baseData = {
  salary: 50000,
  employeeStatus: "Active" as const,
};

describe("employeeManagementSchema", () => {
  it("accepts active employee with salary only", () => {
    const result = employeeManagementSchema.safeParse(baseData);
    expect(result.success).toBe(true);
  });

  it("accepts active employee with optional fields", () => {
    const result = employeeManagementSchema.safeParse({
      ...baseData,
      pf_no: "PF12345",
      uan_no: "UAN12345",
      esic_no: "ESIC12345",
      assets: ["laptop", "mouse"],
    });
    expect(result.success).toBe(true);
  });

  it("defaults employeeStatus to Active when omitted", () => {
    const result = employeeManagementSchema.safeParse({ salary: 40000 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employeeStatus).toBe("Active");
    }
  });

  it("rejects negative salary", () => {
    const result = employeeManagementSchema.safeParse({
      ...baseData,
      salary: -1000,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("positive number");
  });

  describe("Terminated status", () => {
    it("requires reasonForTermination and dateOfTermination", () => {
      const result = employeeManagementSchema.safeParse({
        ...baseData,
        employeeStatus: "Terminated",
      });
      expect(result.success).toBe(false);
      const messages = result.error?.issues.map((i) => i.message) ?? [];
      expect(messages).toContain("Reason for termination is required");
      expect(messages).toContain("Date of termination is required");
    });

    it("requires dateOfTermination even when reason provided", () => {
      const result = employeeManagementSchema.safeParse({
        ...baseData,
        employeeStatus: "Terminated",
        reasonForTermination: "Poor performance",
      });
      expect(result.success).toBe(false);
      const messages = result.error?.issues.map((i) => i.message) ?? [];
      expect(messages).toContain("Date of termination is required");
    });

    it("accepts Terminated with both required fields", () => {
      const result = employeeManagementSchema.safeParse({
        ...baseData,
        employeeStatus: "Terminated",
        reasonForTermination: "Misconduct",
        dateOfTermination: "2024-03-01",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Absconded status", () => {
    it("requires dateOfAbscond", () => {
      const result = employeeManagementSchema.safeParse({
        ...baseData,
        employeeStatus: "Absconded",
      });
      expect(result.success).toBe(false);
      const messages = result.error?.issues.map((i) => i.message) ?? [];
      expect(messages).toContain("Date of abscond is required");
    });

    it("accepts Absconded with dateOfAbscond", () => {
      const result = employeeManagementSchema.safeParse({
        ...baseData,
        employeeStatus: "Absconded",
        dateOfAbscond: "2024-02-15",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("salaryStructure validation", () => {
    it("accepts salary structure components that sum to less than gross salary", () => {
      const result = employeeManagementSchema.safeParse({
        salary: 50000,
        employeeStatus: "Active",
        salaryStructure: {
          basicPay: 25000,
          hra: 15000,
          conveyance: 10000,
          pf: 1800,
          esi: 750,
          pt: 200,
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects a salary structure component exceeding gross salary", () => {
      const result = employeeManagementSchema.safeParse({
        salary: 50000,
        employeeStatus: "Active",
        salaryStructure: {
          basicPay: 60000,
        },
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain(
        "cannot be greater than gross salary",
      );
    });

    it("skips earnings total check when no earning components provided", () => {
      const result = employeeManagementSchema.safeParse({
        salary: 50000,
        employeeStatus: "Active",
        salaryStructure: {
          pf: 1800,
          esi: 750,
        },
      });
      expect(result.success).toBe(true);
    });
  });
});
