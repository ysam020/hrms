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
      permissions: ["Permissions:manage_role_permissions", "JobOpenings:view_applications"],
      wfhEnabled: true,
      designation: "Founder",
    },
  },
};

const member = (n) => ({
  username: n.toLowerCase().replace(" ", "."),
  fullName: n,
});
const roles = [
  { _id: "r1", name: "Employee", assignedTo: ["Rohan Gupta", "Ananya Iyer", "Meera Pillai", "Vikram Rao", "Dev Kapoor", "Isha Verma", "Arjun Das"].map(member) },
  { _id: "r2", name: "Team Lead", assignedTo: ["Priya Nair", "Kabir Singh"].map(member) },
  { _id: "r3", name: "HR Partner", assignedTo: ["Sara Thomas"].map(member) },
  { _id: "r4", name: "Finance", assignedTo: ["Neha Joshi"].map(member) },
];
/** What each role may do; "Module:action:scope" as the gateway stores it. */
const rolePerms = {
  r1: ["HRActivities:view:all", "Attendance:view:self", "Attendance:mark_attendance:self", "Leave:view:self", "Leave:apply:self", "BasicKYCDetails:fill_kyc_form:self", "BasicKYCDetails:view_kyc:self"],
  r2: ["HRActivities:view:all", "Attendance:view:self", "Attendance:view:team", "Attendance:mark_attendance:self", "Leave:view:self", "Leave:view:team", "Leave:apply:self", "Leave:approve:team", "Leave:reject:team"],
  r3: ["HRActivities:view:all", "HRActivities:create", "HRActivities:edit", "Attendance:view:all", "Attendance:attendance_correction:all", "Leave:view:all", "Leave:approve:all", "Leave:reject:all", "EmployeeManagement:view", "EmployeeManagement:edit"],
  r4: ["HRActivities:view:all", "Attendance:view:self", "Leave:view:self", "Leave:apply:self", "TaxDeclaration:view_declaration:all", "TaxDeclaration:review_declaration:all"],
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
  jobDescription: "Shape how Halcyon Labs’ customers plan their week: lead design for scheduling, from research to shipped screens.",
  responsibilities: "Own end-to-end design for the scheduling product. Run research with customers. Grow the design system.",
  qualifications: "A portfolio of shipped product work. Comfort with prototyping and research.",
  requiredSkills: ["Figma", "Design systems", "User research", "Prototyping"],
};

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
/** Applicants (fictional, example.com addresses). */
const applicants = [
  { id: "ap1", name: "Riya Sen", email: "riya.sen@example.com", status: "Interviewing", appliedAt: ago(12), createdAt: ago(12), interviews: [{}, {}] },
  { id: "ap2", name: "Tom Wu", email: "tom.wu@example.com", status: "Applied", appliedAt: ago(4), createdAt: ago(4), interviews: [] },
  { id: "ap3", name: "Lena Ortiz", email: "lena.ortiz@example.com", status: "Rejected", appliedAt: ago(20), createdAt: ago(20), interviews: [{}] },
];

export const EXTRA = [
  [/\/view-applications\//, { success: true, data: applicants }],
  [/\/view-job-opening\/j1$/, { success: true, data: job }],
  [/\/get-roles$/, { success: true, data: { roles } }],
  [/\/get-role-permissions\/(r\d)/, (url) => ({ success: true, data: { permissions: rolePerms[url.pathname.match(/(r\d)$/)[1]] ?? [] } })],
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
            app: { status: "dismissed", stepId: null, seen: [], skipped: [], lastRoute: null, updatedAt: now },
          },
          updatedAt: now,
        },
      },
    },
  ],
  [/\/profile$/, profile],
];
