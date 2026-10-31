import type { TourModuleDef } from "../types";
import { intro, page } from "./shared";

// People: the employee directory, the organisation chart, KYC, recruitment
// and performance reviews.

export const peopleTours: TourModuleDef[] = [
  {
    id: "employees",
    label: "Employees",
    summary: "The employee directory and workforce insights.",
    route: "/employee-management/employee-list",
    steps: [
      intro(
        "employees",
        "Employees",
        "Everyone in your organisation. Directory lists people; Insights shows the workforce in charts.",
      ),
      {
        id: "search",
        target: "employees-search",
        title: "Find someone",
        content: "Search by name, email or username.",
      },
      {
        id: "table",
        target: "employees-table",
        placement: "top",
        title: "Open a profile",
        content:
          "Choose a row to open that person’s profile — work, statutory and personal details. HR can change employment details there with Edit Employment.",
      },
      {
        id: "joining",
        target: "employees-table",
        placement: "top",
        title: "How people are added",
        content:
          "New people arrive through join requests your organisation approves (Settings → Join Requests), or when a candidate is hired in Recruitment.",
      },
      page(
        "insights",
        "Employee Insights",
        "Headcount by department, active rates, and PF and WFH coverage, refreshed from your records.",
        "/employee-management/insights",
      ),
    ],
  },
  {
    id: "org",
    label: "Organization",
    summary: "Your organisation chart: teams, leads and headcount.",
    route: "/organization-tree",
    steps: [
      intro(
        "org",
        "Organization",
        "How your organisation is arranged, built from teams and their leads.",
      ),
      {
        id: "search",
        target: "page-tabs",
        title: "Find a person or team",
        content: "Search the chart by name.",
      },
      {
        id: "chart",
        target: "org-chart",
        placement: "top",
        timeout: 4000,
        title: "Teams and leads",
        content:
          "Expand a team to see its members. Teams are managed under Permissions → Teams.",
      },
    ],
  },
  {
    id: "kyc",
    label: "KYC",
    summary: "Identity and statutory details, submitted and verified.",
    route: "/kyc/view-employee-kycs",
    steps: [
      intro(
        "kyc",
        "KYC",
        "Know Your Customer: the personal, address, identity and bank details payroll and compliance need.",
      ),
      {
        id: "complete",
        target: "kyc-complete",
        title: "Complete your KYC",
        content:
          "Fill in your details step by step. HR reviews them and either approves or asks for changes to specific fields.",
      },
      {
        id: "filters",
        target: "page-tabs",
        title: "Filter records",
        content: "Filter by review status, or search for a person.",
      },
      {
        id: "table",
        target: "kyc-table",
        placement: "top",
        title: "Review a record",
        content:
          "Open a record to read it. Reviewers can approve it or request a revision, with a note beside each field that needs changing.",
      },
      {
        id: "form",
        route: "/kyc/complete-kyc",
        target: ["wizard-steps", "page-title"],
        placement: "auto",
        title: "One section at a time",
        content:
          "The form is split into steps. Move between them freely; problems are flagged on the step they belong to before you submit.",
      },
      page(
        "insights",
        "KYC Insights",
        "KYC status across the organisation, completions over time, and completion by department.",
        "/kyc/insights",
      ),
    ],
  },
  {
    id: "recruitment",
    label: "Recruitment",
    summary: "Job openings, candidates and the hiring pipeline.",
    route: "/job-openings/view-job-openings",
    steps: [
      intro(
        "recruitment",
        "Recruitment",
        "Openings you’re hiring for, their candidates, and how hiring is going.",
      ),
      {
        id: "filters",
        target: "page-tabs",
        title: "Find an opening",
        content: "Filter by Active, Expired or Hired, or search by role.",
      },
      {
        id: "table",
        target: "jobs-table",
        placement: "top",
        title: "Candidates and pipeline",
        content:
          "Open an opening to see its candidates. From there you schedule interview rounds, move candidates on, reject, or hire — hiring creates the employee record.",
      },
      {
        id: "careers",
        target: "jobs-careers",
        timeout: 2500,
        title: "Your careers page",
        content:
          "Active openings are published on your organisation’s public careers page, where candidates apply.",
      },
      {
        id: "new",
        target: "jobs-new",
        title: "Post an opening",
        content: "Create a new opening with a guided form.",
      },
      {
        id: "editor",
        route: "/job-openings/new",
        target: ["wizard-steps", "page-title"],
        placement: "auto",
        title: "A guided job posting",
        content:
          "Role, workplace, skills, description, pay and team, then the application form and screening questions. Nothing is published until you finish the last step.",
      },
      page(
        "insights",
        "Recruitment Insights",
        "Hiring rate by opening, openings by status, the experience and budgets you ask for, and your hiring managers.",
        "/job-openings/insights",
      ),
    ],
  },
  {
    id: "performance",
    label: "Performance",
    summary: "Performance reviews and review cycles.",
    route: "/performance-reviews/reviews",
    steps: [
      intro(
        "performance",
        "Performance",
        "Reviews you receive and reviews you give, run in review cycles.",
      ),
      {
        id: "views",
        target: "page-tabs",
        title: "Your reviews and your team’s",
        content:
          "My Reviews are the reviews about you. If you review others, those are under Reviews I Give.",
      },
      {
        id: "table",
        target: "performance-table",
        placement: "top",
        title: "Open a review",
        content:
          "Choose a review to read it or, when it’s your turn, fill it in and submit.",
      },
      page(
        "cycles",
        "Review Cycles",
        "A cycle sets who is reviewed and when. Reviews are created for the people in it.",
        "/performance-reviews/review-cycles",
      ),
      {
        id: "cycles-new",
        route: "/performance-reviews/review-cycles",
        target: "cycles-new",
        title: "Start a cycle",
        content: "Create a new review cycle; you can edit it before it starts.",
      },
    ],
  },
];
