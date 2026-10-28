import {
  CAPABILITIES,
  WIDGETS,
  defaultLayout,
  personasFor,
  sanitizeLayout,
  type Capabilities,
} from "../config/dashboardWidgets";

const caps = (...on: string[]): Capabilities =>
  Object.fromEntries(
    CAPABILITIES.map((c) => [c, c === "self" || on.includes(c)]),
  ) as Capabilities;

const EMPLOYEE = caps();
const TEAM_LEAD = caps("teamLead");
const RECRUITER = caps("recruiting");
const HR_CAPS = [
  "hr",
  "recruiting",
  "payroll",
  "advances",
  "reviews",
  "kyc",
  "exits",
  "helpdesk",
  "assets",
];
const HR = caps(...HR_CAPS);
const OWNER = caps(...HR_CAPS, "orgAdmin", "joinRequests", "subscription");

const visible = (c: Capabilities) =>
  defaultLayout(c)
    .filter((e) => e.visible)
    .map((e) => e.id);
const available = (c: Capabilities) => defaultLayout(c).map((e) => e.id);

describe("dashboard defaults by persona", () => {
  it("gives an employee only personal widgets", () => {
    expect(visible(EMPLOYEE)).toEqual([
      "my-day",
      "approvals",
      "leave-balance",
      "my-requests",
      "my-reviews",
      "payslip",
      "agenda",
      "announcements",
    ]);
    for (const id of [
      "org-today",
      "workforce",
      "team-today",
      "payroll",
      "hiring",
      "hr-queue",
    ])
      expect(available(EMPLOYEE)).not.toContain(id);
  });

  it("puts a team leader's team ahead of personal widgets", () => {
    const v = visible(TEAM_LEAD);
    expect(v.slice(0, 4)).toEqual([
      "my-day",
      "approvals",
      "team-today",
      "team-leave",
    ]);
    expect(available(TEAM_LEAD)).not.toContain("org-today");
    expect(available(TEAM_LEAD)).not.toContain("payroll");
    // The employee list isn't merged in on top: payslip stays available, off.
    expect(v).not.toContain("payslip");
    expect(available(TEAM_LEAD)).toContain("payslip");
  });

  it("gives a recruiter hiring but no organisation-wide HR data", () => {
    expect(visible(RECRUITER)).toContain("hiring");
    for (const id of ["org-today", "workforce", "headcount-trend", "payroll"])
      expect(available(RECRUITER)).not.toContain(id);
  });

  it("gives HR the people-ops queue and payroll, not the executive trend", () => {
    const v = visible(HR);
    expect(v).toEqual(
      expect.arrayContaining([
        "org-today",
        "hr-queue",
        "joiners-leavers",
        "payroll",
        "workforce",
      ]),
    );
    expect(v).not.toContain("headcount-trend");
    expect(available(HR)).toContain("headcount-trend");
    expect(available(HR)).not.toContain("org-admin");
    expect(personasFor(HR)).toEqual(["people-ops"]);
  });

  it("gives an owner a concise executive view", () => {
    const v = visible(OWNER);
    expect(v).toEqual([
      "my-day",
      "approvals",
      "org-today",
      "workforce",
      "hiring",
      "headcount-trend",
      "org-admin",
      "agenda",
      "announcements",
    ]);
    expect(v).not.toContain("hr-queue");
    expect(available(OWNER)).toContain("hr-queue");
  });

  it("merges personas without duplicates for a team leader with HR access", () => {
    const both = caps(...HR_CAPS, "teamLead");
    const v = visible(both);
    expect(new Set(v).size).toBe(v.length);
    expect(v).toEqual(
      expect.arrayContaining([
        "team-today",
        "team-leave",
        "hr-queue",
        "org-today",
      ]),
    );
  });

  it("lists every authorized widget exactly once", () => {
    for (const c of [EMPLOYEE, TEAM_LEAD, RECRUITER, HR, OWNER]) {
      const ids = available(c);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(available(OWNER).length).toBe(
      WIDGETS.filter((w) => w.id !== "team-today" && w.id !== "team-leave")
        .length,
    );
  });
});

describe("sanitizeLayout", () => {
  const dyn = { teams: ["team-1"], departments: ["Engineering"] };

  it("can hide and reorder, but never grants a widget", () => {
    const out = sanitizeLayout(
      [
        { id: "payslip", visible: true, size: "standard", settings: {} },
        { id: "org-today", visible: true, size: "wide", settings: {} },
        { id: "payroll", visible: true, size: "wide", settings: {} },
        { id: "my-day", visible: false, size: "wide", settings: {} },
      ],
      EMPLOYEE,
      dyn,
    );
    const ids = out.map((e) => e.id);
    expect(ids).not.toContain("org-today");
    expect(ids).not.toContain("payroll");
    expect(ids[0]).toBe("payslip");
    expect(out.find((e) => e.id === "my-day")!.visible).toBe(false);
  });

  it("drops widgets the user has lost access to", () => {
    const saved = defaultLayout(HR);
    const out = sanitizeLayout(saved, EMPLOYEE, dyn);
    expect(out.map((e) => e.id)).not.toContain("hr-queue");
    expect(
      out.every((e) => !["org-today", "workforce", "payroll"].includes(e.id)),
    ).toBe(true);
  });

  it("appends newly available widgets hidden", () => {
    const out = sanitizeLayout(
      [{ id: "my-day", visible: true, size: "wide", settings: {} }],
      TEAM_LEAD,
      dyn,
    );
    const team = out.find((e) => e.id === "team-today")!;
    expect(team).toBeDefined();
    expect(team.visible).toBe(false);
  });

  it("validates sizes and settings, including teams the user doesn't lead", () => {
    const out = sanitizeLayout(
      [
        {
          id: "team-today",
          visible: true,
          size: "huge",
          settings: { team: "someone-elses-team" },
        },
        {
          id: "team-leave",
          visible: true,
          size: "wide",
          settings: { days: 365 },
        },
        { id: "payslip", visible: true, size: "wide", settings: {} },
      ],
      TEAM_LEAD,
      dyn,
    );
    const get = (id: string) => out.find((e) => e.id === id)!;
    expect(get("team-today").size).toBe("wide");
    expect(get("team-today").settings.team).toBe("all");
    expect(get("team-leave").size).toBe("wide");
    expect(get("team-leave").settings.days).toBe(14);
    expect(get("payslip").size).toBe("standard");
  });

  it("keeps a valid team and department choice", () => {
    const out = sanitizeLayout(
      [
        {
          id: "team-today",
          visible: true,
          size: "wide",
          settings: { team: "team-1" },
        },
        {
          id: "org-today",
          visible: true,
          size: "wide",
          settings: { department: "Engineering" },
        },
      ],
      caps("teamLead", "hr"),
      dyn,
    );
    expect(out[0].settings.team).toBe("team-1");
    expect(out[1].settings.department).toBe("Engineering");
  });

  it("ignores junk and duplicates", () => {
    const out = sanitizeLayout(
      [
        null,
        "x",
        { id: "my-day" },
        { id: "my-day", visible: false },
        { id: "nope" },
      ],
      EMPLOYEE,
      dyn,
    );
    expect(out.filter((e) => e.id === "my-day")).toHaveLength(1);
    expect(out.find((e) => e.id === "my-day")!.visible).toBe(true);
    expect(
      sanitizeLayout("not a list", EMPLOYEE, dyn).every((e) => !e.visible),
    ).toBe(true);
  });
});
