import {
  toEmployee,
  getRoleConfig,
} from "@web/features/layout/org-tree/helpers";

const theme = {
  palette: {
    secondary: { main: "#secondary" },
    error: { main: "#error" },
    primary: { main: "#primary" },
    success: { main: "#success" },
    warning: { main: "#warning" },
  },
} as any;

describe("toEmployee", () => {
  it("splits a full name into first and last name", () => {
    const employee = toEmployee(
      {
        id: "1",
        name: "Jane Doe",
        username: "jdoe",
        designation: "Engineer",
        employeePhoto: "p.jpg",
      },
      "Engineering",
    );
    expect(employee).toEqual({
      id: "1",
      first_name: "Jane",
      last_name: "Doe",
      username: "jdoe",
      department: "Engineering",
      designation: "Engineer",
      employeeStatus: "Active",
      employee_photo: "p.jpg",
    });
  });

  it("handles a multi-word last name", () => {
    const employee = toEmployee(
      {
        id: "1",
        name: "Jane Anne Doe",
        username: "jdoe",
        designation: null,
        employeePhoto: null,
      },
      "Eng",
    );
    expect(employee.first_name).toBe("Jane");
    expect(employee.last_name).toBe("Anne Doe");
  });

  it("uses the full name as first_name when there is no space, with an empty last_name", () => {
    const employee = toEmployee(
      {
        id: "1",
        name: "Cher",
        username: "cher",
        designation: null,
        employeePhoto: null,
      },
      "Eng",
    );
    expect(employee.first_name).toBe("Cher");
    expect(employee.last_name).toBe("");
  });

  it("defaults designation and employee_photo to empty strings when null", () => {
    const employee = toEmployee(
      {
        id: "1",
        name: "Jane Doe",
        username: "jdoe",
        designation: null,
        employeePhoto: null,
      },
      "Eng",
    );
    expect(employee.designation).toBe("");
    expect(employee.employee_photo).toBe("");
  });
});

describe("getRoleConfig", () => {
  it("returns the CEO config for a CEO designation", () => {
    expect(getRoleConfig("CEO", theme).color).toBe("#secondary");
  });

  it("returns the manager config for any designation containing MANAGER", () => {
    expect(getRoleConfig("Engineering Manager", theme).color).toBe("#error");
  });

  it("returns the lead config for any designation containing LEAD", () => {
    expect(getRoleConfig("Tech Lead", theme).color).toBe("#primary");
  });

  it("returns the senior config for any designation containing SENIOR", () => {
    expect(getRoleConfig("Senior Developer", theme).color).toBe("#success");
  });

  it("falls back to the default config for an unrecognized designation", () => {
    expect(getRoleConfig("Developer", theme).color).toBe("#warning");
  });

  it("is case-insensitive", () => {
    expect(getRoleConfig("ceo", theme).color).toBe("#secondary");
    expect(getRoleConfig("manager", theme).color).toBe("#error");
  });

  it("handles a null/undefined designation via the default config", () => {
    expect(getRoleConfig(undefined as any, theme).color).toBe("#warning");
  });
});
