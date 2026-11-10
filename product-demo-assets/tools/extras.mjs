// Fixtures the product-demo recordings add to the marketing set. All
// fictional (Halcyon Labs); see harness.mjs.
const now = new Date().toISOString();

/** The owner's profile, with the grants the Security demos need. */
const profile = {
  success: true,
  data: {
    user: {
      id: "u1",
      username: "asha.raman",
      first_name: "Asha",
      fullName: "Asha Raman",
      email: "asha@halcyon.example",
      tenantName: "Halcyon Labs",
      tenantRole: "owner",
      isSuperUser: false,
      permissions: [
        "Permissions:manage_role_permissions",
        "JobOpenings:view_applications",
      ],
      wfhEnabled: true,
      designation: "Founder",
      // Devices that receive push notifications (fictional).
      fcmTokens: [
        {
          deviceFingerprint: "fp-macbook",
          deviceInfo: { browser: "Chrome", os: "macOS", deviceType: "desktop" },
          lastUsed: new Date(Date.now() - 36e5).toISOString(),
        },
        {
          deviceFingerprint: "fp-iphone",
          deviceInfo: { browser: "Safari", os: "iOS", deviceType: "mobile" },
          lastUsed: new Date(Date.now() - 2 * 864e5).toISOString(),
        },
      ],
    },
  },
};

const member = (n) => ({
  username: n.toLowerCase().replace(" ", "."),
  fullName: n,
});
const roles = [
  {
    _id: "r1",
    name: "Employee",
    assignedTo: [
      "Rohan Gupta",
      "Ananya Iyer",
      "Meera Pillai",
      "Vikram Rao",
      "Dev Kapoor",
      "Isha Verma",
      "Arjun Das",
    ].map(member),
  },
  {
    _id: "r2",
    name: "Team Lead",
    assignedTo: ["Priya Nair", "Kabir Singh"].map(member),
  },
  { _id: "r3", name: "HR Partner", assignedTo: ["Sara Thomas"].map(member) },
  { _id: "r4", name: "Finance", assignedTo: ["Neha Joshi"].map(member) },
];
/** What each role may do; "Module:action:scope" as the gateway stores it. */
const rolePerms = {
  r1: [
    "HRActivities:view:all",
    "Attendance:view:self",
    "Attendance:mark_attendance:self",
    "Leave:view:self",
    "Leave:apply:self",
    "BasicKYCDetails:fill_kyc_form:self",
    "BasicKYCDetails:view_kyc:self",
  ],
  r2: [
    "HRActivities:view:all",
    "Attendance:view:self",
    "Attendance:view:team",
    "Attendance:mark_attendance:self",
    "Leave:view:self",
    "Leave:view:team",
    "Leave:apply:self",
    "Leave:approve:team",
    "Leave:reject:team",
  ],
  r3: [
    "HRActivities:view:all",
    "HRActivities:create",
    "HRActivities:edit",
    "Attendance:view:all",
    "Attendance:attendance_correction:all",
    "Leave:view:all",
    "Leave:approve:all",
    "Leave:reject:all",
    "EmployeeManagement:view",
    "EmployeeManagement:edit",
  ],
  r4: [
    "HRActivities:view:all",
    "Attendance:view:self",
    "Leave:view:self",
    "Leave:apply:self",
    "TaxDeclaration:view_declaration:all",
    "TaxDeclaration:review_declaration:all",
  ],
};

const y = new Date().getFullYear();
/** One opening, filled in, for the recruitment demo. */
const job = {
  id: "j1",
  _id: "j1",
  jobTitle: "Senior Product Designer",
  numberOfVacancies: 1,
  candidatesHired: 0,
  applicationDeadline: `${y}-11-30`,
  budget: 2800000,
  budgetDisclosed: false,
  experience: "5",
  jobPostingDate: `${y}-10-02`,
  createdAt: `${y}-10-02T05:30:00.000Z`,
  status: "Active",
  hiringManager: "Priya Nair",
  recruiter: "Sara Thomas",
  department: "Design",
  employmentType: "Full-time",
  workplaceType: "Hybrid",
  minQualification: "Bachelor’s degree",
  jobDescription:
    "Shape how Halcyon Labs’ customers plan their week: lead design for scheduling, from research to shipped screens.",
  responsibilities:
    "Own end-to-end design for the scheduling product. Run research with customers. Grow the design system.",
  qualifications:
    "A portfolio of shipped product work. Comfort with prototyping and research.",
  requiredSkills: ["Figma", "Design systems", "User research", "Prototyping"],
};

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
/** Applicants (fictional, example.com addresses). */
const applicants = [
  {
    id: "ap1",
    name: "Riya Sen",
    email: "riya.sen@example.com",
    status: "Interviewing",
    appliedAt: ago(12),
    createdAt: ago(12),
    interviews: [{}, {}],
  },
  {
    id: "ap2",
    name: "Tom Wu",
    email: "tom.wu@example.com",
    status: "Applied",
    appliedAt: ago(4),
    createdAt: ago(4),
    interviews: [],
  },
  {
    id: "ap3",
    name: "Lena Ortiz",
    email: "lena.ortiz@example.com",
    status: "Rejected",
    appliedAt: ago(20),
    createdAt: ago(20),
    interviews: [{}],
  },
];

export const EXTRA = [
  [/\/view-applications\//, { success: true, data: applicants }],
  [/\/view-job-opening\/j1$/, { success: true, data: job }],
  [/\/get-roles$/, { success: true, data: { roles } }],
  [
    /\/get-role-permissions\/(r\d)/,
    (url) => ({
      success: true,
      data: { permissions: rolePerms[url.pathname.match(/(r\d)$/)[1]] ?? [] },
    }),
  ],
  // The app tour was skipped long ago: no first-run card on Today.
  [
    /\/walkthrough\/progress/,
    {
      success: true,
      data: {
        state: {
          schema: 1,
          version: 1,
          active: null,
          tours: {
            app: {
              status: "dismissed",
              stepId: null,
              seen: [],
              skipped: [],
              lastRoute: null,
              updatedAt: now,
            },
          },
          updatedAt: now,
        },
      },
    },
  ],
  [/\/profile$/, profile],
];

// ── Fixtures added for the full catalogue (2026-11-10). All fictional. ─────

const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();
const b64 = (o) =>
  Buffer.from(JSON.stringify(o))
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
/** A session token for someone who has signed in but has no organisation yet. */
export const PENDING_SETUP_TOKEN = `${b64({ alg: "HS256" })}.${b64({ userId: "u99", pendingSetup: true, exp: 4102444800 })}.sig`;

/** The owner's own record, for My Profile. */
const ashaDetails = {
  success: true,
  data: {
    id: "u1",
    username: "asha.raman",
    first_name: "Asha",
    last_name: "Raman",
    fullName: "Asha Raman",
    designation: "Founder & CEO",
    department: "Leadership",
    joining_date: "2019-04-01",
    email: "asha@halcyon.example",
    official_email: "asha@halcyon.example",
    mobile: "98450 10001",
    employeeStatus: "Active",
    dob: "1988-07-21",
    blood_group: "O+",
    communication_address_line_1: "4th Floor, 12 Residency Road",
    communication_address_city: "Bengaluru",
    communication_address_state: "Karnataka",
    pf_no: "KA/BLR/0009876",
    uan_no: "100123456789",
  },
};

const months = [
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
];
const monthName = ["May", "June", "July", "August", "September", "October"];

export const ANALYTICS = [
  [
    /\/get-employment-type-breakdown/,
    {
      success: true,
      data: { totalEmployees: 48, officeCount: 39, wfhCount: 9 },
    },
  ],
  [
    /\/get-headcount-growth/,
    {
      success: true,
      data: [31, 34, 37, 41, 45, 48].map((n, i) => ({
        monthName: monthName[i],
        year: 2026,
        cumulativeHeadcount: n,
        _id: months[i],
      })),
    },
  ],
  [
    /\/get-joining-data/,
    {
      success: true,
      data: [2, 3, 3, 4, 4, 3].map((n, i) => ({
        formattedDate: `${monthName[i].slice(0, 3)} 26`,
        count: n,
      })),
    },
  ],
  [
    /\/get-employee-status-distribution/,
    {
      success: true,
      data: [
        { status: "active", count: 44 },
        { status: "resigned", count: 3 },
        { status: "terminated", count: 1 },
      ],
    },
  ],
  [
    /\/get-employee-departments/,
    {
      success: true,
      data: [
        ["Engineering", 19],
        ["Sales", 8],
        ["Design", 6],
        ["People", 4],
        ["Finance", 4],
        ["Support", 4],
        ["Legal", 3],
      ].map(([department, count]) => ({ department, count })),
    },
  ],
  [
    /\/get-employee-designations/,
    {
      success: true,
      data: [
        ["Engineer", 15],
        ["Sales Lead", 5],
        ["Product Designer", 5],
        ["HR Partner", 4],
        ["Accountant", 4],
        ["Support Specialist", 4],
      ].map(([designation, count]) => ({ designation, count })),
    },
  ],
  [
    /\/get-age-distribution/,
    {
      success: true,
      data: [
        ["21–25", 9],
        ["26–30", 17],
        ["31–35", 12],
        ["36–40", 6],
        ["41+", 4],
      ].map(([ageGroup, count]) => ({ ageGroup, count })),
    },
  ],
  [
    /\/get-tenure-distribution/,
    {
      success: true,
      data: [
        ["< 1 year", 14],
        ["1–2 years", 13],
        ["2–5 years", 15],
        ["5+ years", 6],
      ].map(([range, count]) => ({ range, count })),
    },
  ],
  [
    /\/get-leave-approval-rate/,
    {
      success: true,
      data: {
        approvalRate: 86,
        total: 142,
        approved: 122,
        pending: 8,
        rejected: 12,
      },
    },
  ],
  [
    /\/get-attendance-trends/,
    {
      success: true,
      data: [93.1, 94.6, 92.8, 95.2, 94.1, 95.8].map((r, i) => ({
        _id: months[i],
        attendanceRate: r,
        avgWorkingHours: [8.4, 8.6, 8.3, 8.7, 8.5, 8.8][i],
      })),
    },
  ],
  [
    /\/get-working-hours-distribution/,
    {
      success: true,
      data: [
        ["< 6 h", 3],
        ["6–8 h", 11],
        ["8–9 h", 24],
        ["9+ h", 10],
      ].map(([_id, count]) => ({ _id, count })),
    },
  ],
  [
    /\/get-leave-type-breakdown/,
    {
      success: true,
      data: [
        ["Casual", 64],
        ["Sick", 41],
        ["Paid", 88],
        ["Comp Off", 9],
      ].map(([leaveType, totalDays]) => ({ leaveType, totalDays })),
    },
  ],
  [
    /\/get-monthly-leave-patterns/,
    {
      success: true,
      data: [18, 22, 15, 19, 27, 31].map((n, i) => ({
        month: months[i],
        count: n,
      })),
    },
  ],
  [
    /\/get-hiring-funnel/,
    {
      success: true,
      data: {
        stages: [
          { stage: "Applied", count: 64 },
          { stage: "Screening", count: 31 },
          { stage: "Interviewing", count: 14 },
          { stage: "Offer", count: 5 },
          { stage: "Hired", count: 4 },
        ],
        hireRate: 6.3,
        interviewingRate: 21.9,
        applied: 64,
        interviewing: 14,
        hired: 4,
        rejected: 22,
      },
    },
  ],
  [
    /\/get-applications-by-job-role/,
    {
      success: true,
      data: [
        ["Senior Product Designer", 23],
        ["Backend Engineer", 29],
        ["Account Executive", 12],
      ].map(([jobTitle, totalApplications]) => ({
        jobTitle,
        totalApplications,
      })),
    },
  ],
  [
    /\/get-job-openings-by-status/,
    {
      success: true,
      data: [
        { status: "Active", count: 3 },
        { status: "Hired", count: 2 },
        { status: "Expired", count: 1 },
      ],
    },
  ],
  [
    /\/get-hiring-manager-performance/,
    {
      success: true,
      data: [
        {
          hiringManager: "Priya Nair",
          name: "Priya Nair",
          openings: 2,
          totalApplications: 52,
          hired: 3,
          avgTimeToHire: 21,
        },
        {
          hiringManager: "Kabir Singh",
          name: "Kabir Singh",
          openings: 1,
          totalApplications: 12,
          hired: 1,
          avgTimeToHire: 18,
        },
      ],
    },
  ],
];

const teamMember = (id, n, d) => ({
  id,
  name: n,
  fullName: n,
  username: n.toLowerCase().replace(" ", "."),
  designation: d,
});
const teams = [
  {
    _id: "tm1",
    teamName: "Engineering",
    teamLeaderId: "u3",
    membersInfo: [
      teamMember("u3", "Priya Nair", "Head of Engineering"),
      teamMember("u5", "Ananya Iyer", "Engineer"),
      teamMember("u7", "Meera Pillai", "Engineer"),
      teamMember("u11", "Isha Verma", "Engineer"),
    ],
  },
  {
    _id: "tm2",
    teamName: "Design",
    teamLeaderId: "u2",
    membersInfo: [
      teamMember("u2", "Aarav Mehta", "Design Lead"),
      teamMember("u9", "Vikram Rao", "Product Designer"),
    ],
  },
  {
    _id: "tm3",
    teamName: "Sales",
    teamLeaderId: "u6",
    membersInfo: [
      teamMember("u6", "Kabir Singh", "Sales Lead"),
      teamMember("u12", "Arjun Das", "Sales Executive"),
    ],
  },
];

const support = [
  {
    id: "st1",
    ticketNo: "PS-1042",
    subject: "Payslip PDF shows last month's logo",
    category: "bug",
    module: "payroll",
    priority: "medium",
    status: "awaiting_customer",
    reporterName: "Asha Raman",
    isMine: true,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(0.2),
  },
  {
    id: "st2",
    ticketNo: "PS-1038",
    subject: "Add a second office for Geofencing",
    category: "feature",
    module: "attendance",
    priority: "low",
    status: "open",
    reporterName: "Asha Raman",
    isMine: true,
    createdAt: daysAgo(6),
    updatedAt: daysAgo(2),
  },
  {
    id: "st3",
    ticketNo: "PS-1021",
    subject: "Invoice for October",
    category: "billing",
    module: "billing",
    priority: "low",
    status: "resolved",
    reporterName: "Asha Raman",
    isMine: true,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(12),
  },
];

/** The owner's own presence (Set Status); saving echoes what was chosen. */
const presence = (body = {}) => ({
  success: true,
  data: {
    presence: {
      userId: "u1",
      availability: body.availability ?? "available",
      status: body.availability ?? "available",
      connectivity: "online",
      source: body.availability ? "manual" : "default",
      message: body.message ?? null,
      expiresAt: null,
      workMode: "office",
      lastSeenAt: new Date().toISOString(),
      revision: body.availability ? 2 : 1,
      at: Date.now(),
      previous: null,
      timeZone: "Asia/Kolkata",
    },
  },
});

export const CATALOGUE_EXTRA = [
  [
    /\/presence\/me$/,
    (url, req) => {
      let body = {};
      try {
        body = req.method() === "GET" ? {} : JSON.parse(req.postData() || "{}");
      } catch {}
      return presence(body);
    },
  ],
  [/\/get-employee-details\/asha\.raman/, ashaDetails],
  ...ANALYTICS,
  [/\/get-teams/, { success: true, data: teams }],
  [/\/get-role-and-permissions/, { success: true, data: { roles } }],
  [
    /\/get-user-permissions\//,
    { success: true, data: { permissions: rolePerms.r2 } },
  ],
  [/\/is-superuser\//, { success: true, data: { isSuperUser: false } }],
  [
    /\/support\/context/,
    {
      success: true,
      data: { tenantName: "Halcyon Labs", plan: "growth", canRaise: true },
    },
  ],
  [
    /\/support\/stats/,
    { success: true, data: { total: 3, open: 1, awaitingYou: 1, resolved: 1 } },
  ],
  [
    /\/support\/tickets(\?|$)/,
    { success: true, data: { tickets: support, total: support.length } },
  ],
  [
    /\/ai-connections$/,
    {
      success: true,
      data: {
        mcpUrl: "https://api.praesto.in/mcp",
        connections: [
          {
            id: "c1",
            clientName: "Claude",
            createdAt: daysAgo(9),
            lastUsedAt: daysAgo(0.1),
            expiresAt: daysAgo(-81),
            scopes: [
              {
                scope: "leave:read",
                description: "Your leave balances and requests",
              },
              { scope: "calendar:read", description: "Your calendar events" },
              {
                scope: "approvals:read",
                description: "Requests waiting for your approval",
              },
            ],
          },
        ],
      },
    },
  ],
];

/** The organisation exists (trial started) but its profile isn't filled in. */
export const PROFILE_PENDING_TOKEN = `${b64({ alg: "HS256" })}.${b64({ userId: "u99", tenantId: "t9", orgSetupComplete: false, exp: 4102444800 })}.sig`;

/**
 * Someone who has signed in with Google but has no organisation yet.
 * `phase.profile = true` moves them on to the company-details step.
 */
export const ONBOARDING = (variant, phase = {}) => [
  [
    /\/refresh-token/,
    () => {
      const t = phase.profile ? PROFILE_PENDING_TOKEN : PENDING_SETUP_TOKEN;
      return { success: true, data: { accessToken: t }, accessToken: t };
    },
  ],
  [/\/tenants\/org-profile/, { success: true, data: {} }, "PUT"],
  [/\/tenants\/available/, { success: true, data: { tenants: [] } }],
  [
    /\/domain-suggestion|\/tenants\/suggest/,
    variant === "join"
      ? {
          success: true,
          data: { suggestion: { tenantId: "t1", tenantName: "Halcyon Labs" } },
        }
      : { success: true, data: {} },
  ],
  [
    /\/tenants\/join-requests$/,
    { success: true, data: { status: "pending", tenantName: "Halcyon Labs" } },
    "POST",
  ],
  [
    /\/trial/,
    {
      success: true,
      data: {
        eligible: true,
        trialDays: 14,
        message:
          "Your first 14 days are free. Your card is checked now and charged only when the trial ends.",
      },
    },
  ],
];

/** Everything the catalogue's flows use by default. */
export const ALL_EXTRA = [...CATALOGUE_EXTRA];
