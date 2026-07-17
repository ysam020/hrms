import formatEmployeeLabel from "@web/shared/utils/formatEmployeeLabel";

describe("formatEmployeeLabel", () => {
  it("combines name and username as 'Name (username)'", () => {
    expect(formatEmployeeLabel("Jane Doe", "jdoe")).toBe("Jane Doe (jdoe)");
  });

  it("trims whitespace from the name", () => {
    expect(formatEmployeeLabel("  Jane Doe  ", "jdoe")).toBe("Jane Doe (jdoe)");
  });

  it("falls back to just the name when username is missing", () => {
    expect(formatEmployeeLabel("Jane Doe", null)).toBe("Jane Doe");
  });

  it("falls back to just the username when name is missing", () => {
    expect(formatEmployeeLabel(null, "jdoe")).toBe("jdoe");
  });

  it("falls back to an em dash when both are missing", () => {
    expect(formatEmployeeLabel(null, null)).toBe("—");
    expect(formatEmployeeLabel(undefined, undefined)).toBe("—");
  });

  it("treats a whitespace-only name as missing", () => {
    expect(formatEmployeeLabel("   ", "jdoe")).toBe("jdoe");
  });
});
