import { employeeManagementSchema } from "@web/shared/schemas/employeeManagement";

const baseData = {
  employeeStatus: "Active" as const,
};

describe("employeeManagementSchema", () => {
  it("accepts active employee with just a status", () => {
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
    const result = employeeManagementSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employeeStatus).toBe("Active");
    }
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
});
