const mockGrpcCall = jest.fn();
jest.mock("../grpc/clients", () => ({
  grpcCall: (...a: any[]) => mockGrpcCall(...a),
  attendanceClient: "attendanceClient",
  leaveClient: "leaveClient",
  recruitmentClient: "recruitmentClient",
  salaryClient: "salaryClient",
}));
const mockFetchFullProfile = jest.fn();
jest.mock("../handlers/auth", () => ({
  fetchFullProfile: (...a: any[]) => mockFetchFullProfile(...a),
}));
jest.mock("../handlers/attendance", () => ({
  monthDateRange: (y: string, m: string) => ({
    startDate: `${y}-${m}-01`,
    endDate: `${y}-${m}-31`,
  }),
}));
const mockListHolidays = jest.fn();
jest.mock("../handlers/general", () => ({
  listHolidays: (...a: any[]) => mockListHolidays(...a),
}));
const mockLookupPublicTenant = jest.fn();
jest.mock("../middleware/resolvePublicTenant", () => ({
  lookupPublicTenant: (...a: any[]) => mockLookupPublicTenant(...a),
}));
const mockRunAsTenant = jest.fn((_t: any, _a: any, fn: any) => fn());
jest.mock("../mcp/principal", () => ({
  runAsTenant: (...a: any[]) => (mockRunAsTenant as any)(...a),
}));
// Helpers the role-gated tools reuse; exercised in mcpWorkTools.test.ts.
jest.mock("../handlers/approvalChains", () => ({}));
jest.mock("../handlers/employee", () => ({}));
jest.mock("../handlers/tenant", () => ({}));
jest.mock("../handlers/helpdesk", () => ({}));
jest.mock("../handlers/reports", () => ({}));
jest.mock("../handlers/tenantSettings", () => ({}));
jest.mock("../utils/user", () => ({}));
const mockDb = {
  tenant: { findUnique: jest.fn() },
  policy: { findMany: jest.fn(), findFirst: jest.fn() },
  hrActivity: { findMany: jest.fn() },
};
jest.mock("@hrms/db", () => ({ prismaWithTenant: mockDb }));

import { TOOLS, ToolError } from "../mcp/tools";
import type { McpPrincipal } from "../mcp/principal";

const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

const ME = "507f1f77bcf86cd799439011";
const SOMEONE_ELSE = "507f1f77bcf86cd799439099";
const principal: McpPrincipal = {
  userId: ME,
  username: "psharma",
  tenantId: "507f1f77bcf86cd799439022",
  tenantRole: "employee",
  dbName: "hrms-acme",
  scopes: new Set([
    "profile:read",
    "leave:read",
    "attendance:read",
    "payroll:read",
    "org:read",
  ]),
  clientId: "mcp_abc",
  clientName: "Claude",
  grantId: "g1",
};

describe("tool catalogue", () => {
  it("covers every capability the retired chatbot had", () => {
    // chatbot.ts tools → MCP tools (see docs/mcp.md parity table)
    const parity: Record<string, string> = {
      get_user_profile: "get_my_profile",
      get_leave_balance: "get_my_leave_balance",
      get_leave_applications: "list_my_leave_applications",
      get_attendance: "get_my_attendance",
      get_salary_info: "get_my_salary",
      get_policies: "search_policies",
    };
    for (const mcpName of Object.values(parity)) {
      expect(TOOLS.map((t) => t.name)).toContain(mcpName);
    }
  });

  it("has no tool that takes a user, employee or tenant argument", () => {
    for (const t of TOOLS) {
      const keys = Object.keys(t.input.shape);
      expect(
        keys.filter((k) => /user|employee|tenant|member/i.test(k)),
      ).toEqual([]);
    }
  });

  it("every schema is strict — smuggled identity arguments are rejected, not ignored", () => {
    for (const t of TOOLS) {
      for (const smuggled of [
        { userId: SOMEONE_ELSE },
        { tenantId: "507f1f77bcf86cd799439098" },
        { username: "sneha_joshi" },
      ]) {
        expect(t.input.safeParse(smuggled).success).toBe(false);
      }
    }
  });

  it("only the careers tools are public", () => {
    expect(
      TOOLS.filter((t) => t.scope === null)
        .map((t) => t.name)
        .sort(),
    ).toEqual(["get_job_opening", "list_job_openings"]);
  });

  it("salary needs its own scope", () => {
    expect(tool("get_my_salary").scope).toBe("payroll:read");
  });
});

describe("'my' tools only ever read the token's own user", () => {
  beforeEach(() => mockGrpcCall.mockResolvedValue({ data: [] }));

  it.each([
    ["get_my_leave_balance", {}, "getLeaveBalance"],
    ["list_my_leave_applications", { limit: 5 }, "getLeaves"],
    ["get_my_attendance", { year: 2026, month: 10 }, "getAttendance"],
  ])("%s calls %s with the principal's userId", async (name, args, rpc) => {
    await tool(name).run(args, principal);
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      rpc,
      expect.objectContaining({ userId: ME }),
    );
  });

  it("get_my_salary reads the caller's own structure", async () => {
    mockGrpcCall.mockResolvedValue({
      data: { month: 9, year: 2026, netPayable: 1000, components: [] },
    });
    const out: any = await tool("get_my_salary").run({}, principal);
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "salaryClient",
      "getSalaryStructure",
      {
        userId: ME,
      },
    );
    expect(out.netPayable).toBe(1000);
  });

  it("get_my_salary wants both year and month or neither", async () => {
    await expect(
      tool("get_my_salary").run({ year: 2026 }, principal),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("refuses to run without a user — a blank userId means 'everyone' to the services", async () => {
    await expect(
      tool("list_my_leave_applications").run({}, null),
    ).rejects.toThrow();
    await expect(
      tool("list_my_leave_applications").run({}, { ...principal, userId: "" }),
    ).rejects.toThrow();
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("get_my_profile returns the caller's profile without identity documents", async () => {
    mockFetchFullProfile.mockResolvedValue({
      fullName: "P Sharma",
      username: "psharma",
      mobile: "9999999999",
      aadhar_no: "1234 5678 9012",
      pan_no: "ABCDE1234F",
      bank_account_no: "000111",
      face_descriptor: [1, 2, 3],
      fcmTokens: ["t"],
    });
    mockDb.tenant.findUnique.mockResolvedValue({ name: "Acme" });
    const out = await tool("get_my_profile").run({}, principal);
    expect(mockFetchFullProfile).toHaveBeenCalledWith(ME);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(
      /1234 5678|ABCDE1234F|000111|aadhar|pan_no|bank|face|fcm/i,
    );
    expect(out).toMatchObject({ username: "psharma", organisation: "Acme" });
  });
});

describe("organisation tools", () => {
  it("search_policies never returns deleted policies", async () => {
    mockDb.policy.findMany.mockResolvedValue([]);
    await tool("search_policies").run({ query: "leave" }, principal);
    expect(mockDb.policy.findMany.mock.calls[0][0].where.status).toEqual({
      notIn: ["deleted", "Deleted"],
    });
  });

  it("get_policy excludes deleted policies in the query itself", async () => {
    mockDb.policy.findFirst.mockResolvedValue(null);
    await expect(
      tool("get_policy").run(
        { policy_id: "507f1f77bcf86cd799439044" },
        principal,
      ),
    ).rejects.toBeInstanceOf(ToolError);
    expect(mockDb.policy.findFirst.mock.calls[0][0].where).toEqual({
      id: "507f1f77bcf86cd799439044",
      status: { notIn: ["deleted", "Deleted"] },
    });
  });

  it("get_policy rejects ids that aren't ObjectIds (no operator injection)", () => {
    expect(
      tool("get_policy").input.safeParse({ policy_id: { $ne: null } }).success,
    ).toBe(false);
    expect(
      tool("get_policy").input.safeParse({ policy_id: "abc" }).success,
    ).toBe(false);
  });

  it("list_announcements shows only Active ones", async () => {
    mockDb.hrActivity.findMany.mockResolvedValue([]);
    await tool("list_announcements").run({}, principal);
    expect(mockDb.hrActivity.findMany.mock.calls[0][0].where).toEqual({
      status: "Active",
    });
  });

  it("bounds result sizes", () => {
    expect(
      tool("search_policies").input.safeParse({ limit: 500 }).success,
    ).toBe(false);
    expect(
      tool("list_my_leave_applications").input.safeParse({ limit: 21 }).success,
    ).toBe(false);
    expect(
      tool("list_announcements").input.safeParse({ query: "x".repeat(101) })
        .success,
    ).toBe(false);
  });
});

describe("public careers tools", () => {
  const jobs = [
    {
      id: "a",
      jobTitle: "Engineer",
      status: "Active",
      visibility: "external",
      budget: [9e6],
      hiringManager: "Boss",
      createdBy: "u1",
      candidatesHired: 2,
    },
    {
      id: "b",
      jobTitle: "Internal only",
      status: "Active",
      visibility: "internal",
    },
    { id: "c", jobTitle: "Both", status: "Active", visibility: "both" },
    { id: "d", jobTitle: "Expired", status: "Expired", visibility: "external" },
  ];

  beforeEach(() => {
    mockLookupPublicTenant.mockResolvedValue({ id: "t1", dbName: "hrms-acme" });
    mockGrpcCall.mockResolvedValue({ data: jobs });
  });

  it("list only openings a careers page is meant to show, without internal fields", async () => {
    const out: any = await tool("list_job_openings").run(
      { organisation: "acme-corp" },
      null,
    );
    expect(out.jobs.map((j: any) => j.id)).toEqual(["a", "c"]);
    expect(JSON.stringify(out)).not.toMatch(
      /budget|hiringManager|createdBy|candidatesHired|visibility|Boss/,
    );
    // Tenant context comes from the slug lookup, not from anything else.
    expect(mockRunAsTenant).toHaveBeenCalledWith(
      { tenantId: "t1", dbName: "hrms-acme" },
      undefined,
      expect.any(Function),
    );
  });

  it("get_job_opening hides internal and non-active openings", async () => {
    for (const j of [jobs[1], jobs[3]]) {
      mockGrpcCall.mockResolvedValue({ data: j });
      await expect(
        tool("get_job_opening").run(
          { organisation: "acme-corp", job_id: "507f1f77bcf86cd799439055" },
          null,
        ),
      ).rejects.toBeInstanceOf(ToolError);
    }
  });

  it("an unknown or inactive organisation is not found", async () => {
    mockLookupPublicTenant.mockResolvedValue(null);
    await expect(
      tool("list_job_openings").run({ organisation: "nope" }, null),
    ).rejects.toBeInstanceOf(ToolError);
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("rejects malformed organisation slugs", () => {
    for (const organisation of ["../etc", "ACME", "a b", ""]) {
      expect(
        tool("list_job_openings").input.safeParse({ organisation }).success,
      ).toBe(false);
    }
  });
});

describe("no model on the Praesto side", () => {
  it("tools make no outbound HTTP calls and need no Ollama / LLM config", async () => {
    const fetchSpy = jest.spyOn(global, "fetch" as any);
    delete process.env.OLLAMA_URL;
    delete process.env.OLLAMA_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    mockGrpcCall.mockResolvedValue({ data: [] });
    mockDb.policy.findMany.mockResolvedValue([]);
    mockDb.hrActivity.findMany.mockResolvedValue([]);
    mockListHolidays.mockResolvedValue([]);
    await tool("get_my_attendance").run({}, principal);
    await tool("search_policies").run({}, principal);
    await tool("list_announcements").run({}, principal);
    await tool("list_holidays").run({}, principal);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
