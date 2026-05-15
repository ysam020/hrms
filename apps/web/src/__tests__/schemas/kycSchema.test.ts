import { kycSchema } from "@web/shared/schemas/kyc";

const validKyc = {
  employee_photo: "photo.jpg",
  designation: "Engineer",
  department: "Engineering",
  joining_date: "2024-01-01",
  dob: "1995-05-15",
  permanent_address_line_1: "123 Main St",
  permanent_address_line_2: "Apt 4B",
  permanent_address_city: "Mumbai",
  permanent_address_state: "Maharashtra",
  permanent_address_pincode: "400001",
  communication_address_line_1: "456 Park Ave",
  communication_address_line_2: "Floor 2",
  communication_address_city: "Pune",
  communication_address_state: "Maharashtra",
  communication_address_pincode: "411001",
  email: "user@example.com",
  official_email: "",
  mobile: "9876543210",
  qualification: "B.Tech",
  aadhar_no: "123456789012",
  aadhar_photo_front: "front.jpg",
  aadhar_photo_back: "back.jpg",
  pan_no: "ABCDE1234F",
  pan_photo: "pan.jpg",
  bank_account_no: "123456789",
  bank_name: "HDFC Bank",
  ifsc_code: "HDFC0001234",
};

describe("kycSchema", () => {
  it("accepts a fully valid KYC submission", () => {
    const result = kycSchema.safeParse(validKyc);
    expect(result.success).toBe(true);
  });

  it("rejects invalid mobile number", () => {
    const result = kycSchema.safeParse({ ...validKyc, mobile: "1234567890" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Invalid mobile");
  });

  it("rejects mobile not starting with 6-9", () => {
    const result = kycSchema.safeParse({ ...validKyc, mobile: "5000000000" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid aadhar number (not 12 digits)", () => {
    const result = kycSchema.safeParse({ ...validKyc, aadhar_no: "12345" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Invalid AADHAR");
  });

  it("rejects invalid PAN number format", () => {
    const result = kycSchema.safeParse({ ...validKyc, pan_no: "invalid" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Invalid PAN");
  });

  it("rejects invalid permanent pincode", () => {
    const result = kycSchema.safeParse({
      ...validKyc,
      permanent_address_pincode: "1234",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Invalid pincode");
  });

  it("rejects invalid communication pincode", () => {
    const result = kycSchema.safeParse({
      ...validKyc,
      communication_address_pincode: "abcdef",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Invalid pincode");
  });

  it("rejects missing required fields", () => {
    const result = kycSchema.safeParse({ ...validKyc, employee_photo: "" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Employee photo is required",
    );
  });

  it("accepts optional official_email as empty string", () => {
    const result = kycSchema.safeParse({
      ...validKyc,
      official_email: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid official_email when provided", () => {
    const result = kycSchema.safeParse({
      ...validKyc,
      official_email: "official@company.com",
    });
    expect(result.success).toBe(true);
  });
});
