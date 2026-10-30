// The MCP tools that read beyond the caller's own records (approvals,
// messages, helpdesk, recruitment, reports) and the remaining self-service
// ones (calendar, WFH). Each must apply the same server-side rule as its web
// screen, with the identity taken from the token alone, and never write.

jest.mock("../grpc/clients", () => ({ grpcCall: jest.fn() }));
jest.mock("../handlers/auth", () => ({ fetchFullProfile: jest.fn() }));
jest.mock("../handlers/attendance", () => ({ monthDateRange: jest.fn() }));
jest.mock("../middleware/resolvePublicTenant", () => ({
  lookupPublicTenant: jest.fn(),
}));
jest.mock("../mcp/principal", () => ({
  runAsTenant: jest.fn((_t: any, _a: any, fn: any) => fn()),
}));

const mockListCalendarEvents = jest.fn();
const mockListHolidays = jest.fn();
jest.mock("../handlers/general", () => ({
  listCalendarEvents: (...a: any[]) => mockListCalendarEvents(...a),
  listHolidays: (...a: any[]) => mockListHolidays(...a),
}));
const mockChainItems = jest.fn();
const mockKycItems = jest.fn();
const mockJoinItems = jest.fn();
jest.mock("../handlers/approvalChains", () => ({
  getPendingApprovalItems: (...a: any[]) => mockChainItems(...a),
}));
jest.mock("../handlers/employee", () => ({
  getPendingKycItems: (...a: any[]) => mockKycItems(...a),
}));
jest.mock("../handlers/tenant", () => ({
  getPendingJoinRequestItems: (...a: any[]) => mockJoinItems(...a),
}));
const mockIsHelpdeskManager = jest.fn();
jest.mock("../handlers/helpdesk", () => ({
  assertHrRole: (...a: any[]) => mockIsHelpdeskManager(...a),
}));
const mockCanUseReports = jest.fn();
const mockExecuteReport = jest.fn();
jest.mock("../handlers/reports", () => ({
  assertHrRole: (...a: any[]) => mockCanUseReports(...a),
  executeReport: (...a: any[]) => mockExecuteReport(...a),
}));
const mockSettings = jest.fn();
jest.mock("../handlers/tenantSettings", () => ({
  getActiveSettings: (...a: any[]) => mockSettings(...a),
}));
const mockIsSuperUser = jest.fn();
jest.mock("../utils/user", () => ({
  isSuperUser: (...a: any[]) => mockIsSuperUser(...a),
}));
jest.mock("@hrms/common", () => ({
  HR_ROLES: ["owner", "admin", "hr"],
  hasPrivilegedRole: (role: string, allowed = ["owner", "admin"]) =>
    !!role && allowed.includes(role),
}));

const model = () => ({
  findMany: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn(),
  groupBy: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
});
const mockDb: Record<string, ReturnType<typeof model>> = {
  user: model(),
  wfhRequest: model(),
  chatRoom: model(),
  message: model(),
  ticket: model(),
  jobOpening: model(),
  jobApplication: model(),
  savedReport: model(),
};
jest.mock("@hrms/db", () => ({ prismaWithTenant: mockDb }));

import { TOOLS, ToolError } from "../mcp/tools";
import type { McpPrincipal } from "../mcp/principal";

const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

const ME = "507f1f77bcf86cd799439011";
const OTHER = "507f1f77bcf86cd799439099";
const as = (tenantRole: string): McpPrincipal => ({
  userId: ME,
  username: "psharma",
  tenantId: "507f1f77bcf86cd799439022",
  tenantRole,
  dbName: "hrms-acme",
  scopes: new Set(),
  clientId: "mcp_abc",
  clientName: "Claude",
  grantId: "g1",
});
const employee = as("employee");

/** No tool may write: every mutating Prisma call stays untouched. */
function expectNoWrites() {
  for (const m of Object.values(mockDb)) {
    expect(m.update).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  for (const m of Object.values(mockDb)) {
    for (const fn of Object.values(m)) fn.mockReset();
    m.findMany.mockResolvedValue([]);
    m.count.mockResolvedValue(0);
    m.groupBy.mockResolvedValue([]);
  }
  mockDb.user.findUnique.mockResolvedValue({
    isSuperUser: false,
    permissions: [],
  });
  mockIsSuperUser.mockResolvedValue(false);
});

describe("catalogue", () => {
  it("covers each requested area with a read-only tool", () => {
    for (const name of [
      "list_my_approvals",
      "list_my_calendar",
      "list_unread_messages",
      "get_my_attendance",
      "list_my_leave_applications",
      "list_my_wfh_requests",
      "list_holidays",
      "get_recruitment_pipeline",
      "list_announcements",
      "list_helpdesk_tickets",
      "list_saved_reports",
    ]) {
      expect(TOOLS.map((t) => t.name)).toContain(name);
    }
  });

  it("puts the tools that pass on other people's data behind their own scopes", () => {
    expect(tool("list_unread_messages").scope).toBe("messages:read");
    expect(tool("get_recruitment_pipeline").scope).toBe("recruitment:read");
    expect(tool("list_job_candidates").scope).toBe("recruitment:read");
    expect(tool("run_saved_report").scope).toBe("reports:read");
  });
});

describe("approvals", () => {
  it("asks the inbox's own helpers, as the token's user with their current role", async () => {
    mockChainItems.mockResolvedValue([
      {
        instanceId: "i1",
        module: "leave",
        entityId: "e1",
        requestedBy: OTHER,
        requestedByName: "sneha",
        summary: "sneha asked for leave",
        detail: "3–5 Nov",
        createdAt: "2026-10-20",
      },
    ]);
    mockKycItems.mockResolvedValue([]);
    mockJoinItems.mockResolvedValue([]);
    const out: any = await tool("list_my_approvals").run({}, as("manager"));
    for (const helper of [mockChainItems, mockKycItems, mockJoinItems]) {
      expect(helper).toHaveBeenCalledWith({
        user: expect.objectContaining({
          userId: ME,
          tenantId: "507f1f77bcf86cd799439022",
          tenantRole: "manager",
        }),
      });
    }
    expect(out.pending).toEqual([
      {
        type: "leave",
        summary: "sneha asked for leave",
        detail: "3–5 Nov",
        requestedBy: "sneha",
        requestedAt: "2026-10-20",
      },
    ]);
    // Internal ids aren't passed on.
    expect(JSON.stringify(out)).not.toMatch(/i1|e1|507f1f77bcf86cd799439099/);
  });

  it("takes no arguments, so nobody else's inbox can be named", () => {
    expect(
      tool("list_my_approvals").input.safeParse({ userId: OTHER }).success,
    ).toBe(false);
  });
});

describe("calendar", () => {
  it("returns the caller's own events and holidays inside the range", async () => {
    mockListCalendarEvents.mockResolvedValue([
      { title: "1:1", date: "2026-11-03" },
      { title: "Old", date: "2026-01-01" },
    ]);
    mockListHolidays.mockResolvedValue([
      { name: "Diwali", date: "2026-11-08" },
      { name: "Holi", date: "2026-03-04" },
    ]);
    const out: any = await tool("list_my_calendar").run(
      { from: "2026-11-01", to: "2026-11-30" },
      employee,
    );
    expect(mockListCalendarEvents).toHaveBeenCalledWith(ME);
    expect(out.events.map((e: any) => e.title)).toEqual(["1:1"]);
    expect(out.holidays.map((h: any) => h.name)).toEqual(["Diwali"]);
  });

  it("rejects backwards or over-long ranges", async () => {
    await expect(
      tool("list_my_calendar").run(
        { from: "2026-11-30", to: "2026-11-01" },
        employee,
      ),
    ).rejects.toBeInstanceOf(ToolError);
    await expect(
      tool("list_my_calendar").run(
        { from: "2024-01-01", to: "2026-01-01" },
        employee,
      ),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

describe("work from home", () => {
  it("reads only the caller's own requests", async () => {
    mockSettings.mockResolvedValue({ wfhEnabled: true });
    await tool("list_my_wfh_requests").run({ status: "Pending" }, employee);
    expect(mockDb.wfhRequest.findMany.mock.calls[0][0].where).toEqual({
      userId: ME,
      status: "Pending",
    });
  });

  it("is refused when the organisation has WFH turned off, like the /wfh routes", async () => {
    mockSettings.mockResolvedValue({ wfhEnabled: false });
    await expect(
      tool("list_my_wfh_requests").run({}, employee),
    ).rejects.toBeInstanceOf(ToolError);
    expect(mockDb.wfhRequest.findMany).not.toHaveBeenCalled();
  });
});

describe("unread messages", () => {
  it("covers only conversations the caller is in, others' messages they haven't read", async () => {
    mockDb.chatRoom.findMany.mockResolvedValue([
      { id: "r1", type: "direct", name: null, participants: [ME, OTHER] },
    ]);
    mockDb.message.findMany.mockResolvedValue([
      {
        chatRoomId: "r1",
        senderId: OTHER,
        content: "Lunch?",
        type: "text",
        createdAt: "2026-10-30T09:00:00Z",
      },
    ]);
    mockDb.message.count.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([
      { id: OTHER, username: "sneha", first_name: "Sneha", last_name: "Joshi" },
    ]);
    const out: any = await tool("list_unread_messages").run({}, employee);
    expect(mockDb.chatRoom.findMany.mock.calls[0][0].where).toEqual({
      participants: { has: ME },
      NOT: { deletedFor: { has: ME } },
    });
    expect(mockDb.message.findMany.mock.calls[0][0].where).toEqual({
      chatRoomId: { in: ["r1"] },
      isDeleted: false,
      NOT: [{ senderId: ME }, { readBy: { has: ME } }],
    });
    expect(out.messages).toEqual([
      {
        from: "Sneha Joshi",
        conversation: "Direct message",
        text: "Lunch?",
        sentAt: "2026-10-30T09:00:00Z",
      },
    ]);
    // Reading doesn't mark anything as read.
    expectNoWrites();
  });

  it("lists files instead of linking to them", async () => {
    mockDb.chatRoom.findMany.mockResolvedValue([
      { id: "r1", type: "group", name: "Design", participants: [ME] },
    ]);
    mockDb.message.findMany.mockResolvedValue([
      {
        chatRoomId: "r1",
        senderId: OTHER,
        content: "",
        type: "file",
        createdAt: "x",
      },
    ]);
    const out: any = await tool("list_unread_messages").run({}, employee);
    expect(out.messages[0]).toMatchObject({
      conversation: "Design",
      text: "[file]",
    });
    expect(mockDb.message.findMany.mock.calls[0][0].select).not.toHaveProperty(
      "fileUrl",
    );
  });
});

describe("helpdesk", () => {
  const ticket = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    ticketNo: "T-1",
    title: "Laptop",
    description: "Broken",
    category: "IT",
    priority: "high",
    status: "open",
    raisedBy: OTHER,
    assignedTo: null,
    slaDeadline: new Date(Date.now() - 60_000),
    slaBreached: false,
    createdAt: new Date(),
    comments: [
      {
        userId: OTHER,
        comment: "Any update?",
        isInternal: false,
        createdAt: 1,
      },
      { userId: ME, comment: "HR-only note", isInternal: true, createdAt: 2 },
    ],
    ...over,
  });

  it("someone who doesn't manage the helpdesk sees only tickets they raised", async () => {
    mockIsHelpdeskManager.mockResolvedValue(false);
    await tool("list_helpdesk_tickets").run({}, employee);
    expect(mockIsHelpdeskManager).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ME, tenantRole: "employee" }),
    );
    expect(mockDb.ticket.findMany.mock.calls[0][0].where).toEqual({
      raisedBy: ME,
    });
  });

  it("a helpdesk manager sees every ticket", async () => {
    mockIsHelpdeskManager.mockResolvedValue(true);
    await tool("list_helpdesk_tickets").run({}, as("hr"));
    expect(mockDb.ticket.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("reports an overdue ticket as breached without writing it back", async () => {
    mockIsHelpdeskManager.mockResolvedValue(true);
    mockDb.ticket.findMany.mockResolvedValue([ticket()]);
    const out: any = await tool("list_helpdesk_tickets").run({}, as("hr"));
    expect(out.tickets[0].slaBreached).toBe(true);
    expectNoWrites();
  });

  it("someone else's ticket reads as not found for a non-manager", async () => {
    mockIsHelpdeskManager.mockResolvedValue(false);
    mockDb.ticket.findUnique.mockResolvedValue(ticket());
    await expect(
      tool("get_helpdesk_ticket").run(
        { ticket_id: "507f1f77bcf86cd799439044" },
        employee,
      ),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("hides internal notes from the person who raised the ticket", async () => {
    mockIsHelpdeskManager.mockResolvedValue(false);
    mockDb.ticket.findUnique.mockResolvedValue(ticket({ raisedBy: ME }));
    const out: any = await tool("get_helpdesk_ticket").run(
      { ticket_id: "507f1f77bcf86cd799439044" },
      employee,
    );
    expect(out.comments.map((c: any) => c.text)).toEqual(["Any update?"]);
  });

  it("shows internal notes to a helpdesk manager", async () => {
    mockIsHelpdeskManager.mockResolvedValue(true);
    mockDb.ticket.findUnique.mockResolvedValue(ticket());
    const out: any = await tool("get_helpdesk_ticket").run(
      { ticket_id: "507f1f77bcf86cd799439044" },
      as("hr"),
    );
    expect(out.comments).toHaveLength(2);
  });
});

describe("recruitment", () => {
  it("refuses the pipeline to an employee without recruitment access, before querying", async () => {
    await expect(
      tool("get_recruitment_pipeline").run({}, employee),
    ).rejects.toBeInstanceOf(ToolError);
    expect(mockDb.jobOpening.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ["an HR member", as("hr"), { isSuperUser: false, permissions: [] }],
    [
      "an employee with a JobOpenings permission",
      employee,
      { isSuperUser: false, permissions: ["JobOpenings:take_interview:-"] },
    ],
  ])(
    "lets %s see the pipeline (the web Job Openings rule)",
    async (_l, p, u) => {
      mockDb.user.findUnique.mockResolvedValue(u);
      mockDb.jobOpening.findMany.mockResolvedValue([
        {
          id: "o1",
          jobTitle: "Engineer",
          status: "Active",
          visibility: "external",
        },
      ]);
      mockDb.jobApplication.groupBy.mockResolvedValue([
        { jobTitleId: "o1", status: "Applied", _count: { id: 3 } },
        { jobTitleId: "o1", status: "Interview", _count: { id: 2 } },
      ]);
      const out: any = await tool("get_recruitment_pipeline").run({}, p);
      expect(out.openings[0]).toMatchObject({
        title: "Engineer",
        candidates: 5,
        candidatesByStatus: { Applied: 3, Interview: 2 },
      });
    },
  );

  it("keeps candidate lists to owners, admins and superusers — HR alone isn't enough", async () => {
    await expect(
      tool("list_job_candidates").run(
        { job_id: "507f1f77bcf86cd799439055" },
        as("hr"),
      ),
    ).rejects.toBeInstanceOf(ToolError);
    expect(mockDb.jobApplication.findMany).not.toHaveBeenCalled();
  });

  it("gives an admin candidate names and progress, never contact or ID details", async () => {
    mockDb.jobOpening.findFirst.mockResolvedValue({ jobTitle: "Engineer" });
    mockDb.jobApplication.findMany.mockResolvedValue([
      {
        name: "Asha",
        status: "Interview",
        currentStageOrder: 2,
        resumeScore: 81,
      },
    ]);
    const out: any = await tool("list_job_candidates").run(
      { job_id: "507f1f77bcf86cd799439055" },
      as("admin"),
    );
    const select = mockDb.jobApplication.findMany.mock.calls[0][0].select;
    for (const field of [
      "email",
      "mobile",
      "aadharNo",
      "resume",
      "hireSalary",
    ]) {
      expect(select).not.toHaveProperty(field);
    }
    expect(out.candidates).toEqual([
      { name: "Asha", status: "Interview", stage: 2, resumeScore: 81 },
    ]);
  });
});

describe("reports", () => {
  it("are refused to anyone the reports API refuses, before querying", async () => {
    mockCanUseReports.mockResolvedValue(false);
    await expect(
      tool("list_saved_reports").run({}, as("admin")),
    ).rejects.toBeInstanceOf(ToolError);
    await expect(
      tool("run_saved_report").run(
        { report_id: "507f1f77bcf86cd799439066" },
        as("admin"),
      ),
    ).rejects.toBeInstanceOf(ToolError);
    expect(mockCanUseReports).toHaveBeenCalledWith(ME);
    expect(mockDb.savedReport.findMany).not.toHaveBeenCalled();
    expect(mockExecuteReport).not.toHaveBeenCalled();
  });

  it("runs a saved report capped at 200 rows, without stamping lastRunAt", async () => {
    mockCanUseReports.mockResolvedValue(true);
    mockDb.savedReport.findUnique.mockResolvedValue({
      name: "Attendance",
      entity: "attendance",
      config: { columns: ["status"], limit: 5000 },
    });
    mockExecuteReport.mockResolvedValue([{ status: "Present" }]);
    const out: any = await tool("run_saved_report").run(
      { report_id: "507f1f77bcf86cd799439066" },
      as("admin"),
    );
    expect(mockExecuteReport).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "attendance", limit: 200 }),
    );
    expect(out).toMatchObject({ report: "Attendance", rowCount: 1 });
    expectNoWrites();
  });
});
