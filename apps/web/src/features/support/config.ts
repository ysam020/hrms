import hasPermission from "@web/shared/utils/permissions/hasPermission";
import type { IconName, Tone } from "@next/ui";

// Support tickets to the Praesto team. Mirrors the gateway's
// config/support.ts (keys, limits, transitions) — keep them in step. The
// predicates here only decide what to show; the server enforces them.

export const CATEGORIES = [
  {
    value: "bug_report",
    label: "Bug Report",
    icon: "alert",
    description: "Something is not working as expected.",
  },
  {
    value: "technical_issue",
    label: "Technical Issue",
    icon: "device",
    description: "An error, loading problem, or technical failure.",
  },
  {
    value: "billing",
    label: "Billing & Subscription",
    icon: "card",
    description: "Subscription, invoice, or payment-related issues.",
  },
  {
    value: "feature_request",
    label: "Feature Request",
    icon: "sparkle",
    description: "Request a new capability in Praesto.",
  },
  {
    value: "improvement",
    label: "Improvement Suggestion",
    icon: "star",
    description: "Suggest an improvement to an existing feature.",
  },
  {
    value: "general",
    label: "General Inquiry",
    icon: "help",
    description: "Ask a general question about Praesto.",
  },
  {
    value: "security",
    label: "Security Concern",
    icon: "shield",
    description:
      "Report a possible security vulnerability or security-related issue.",
  },
] as const satisfies readonly {
  value: string;
  label: string;
  icon: IconName;
  description: string;
}[];

export type Category = (typeof CATEGORIES)[number]["value"];
export const categoryOf = (v?: string) => CATEGORIES.find((c) => c.value === v);
export const categoryLabel = (v?: string) => categoryOf(v)?.label ?? "—";

export const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;
export const priorityLabel = (v?: string) =>
  PRIORITIES.find((p) => p.value === v)?.label ?? "—";
export const priorityTone = (v?: string): Tone =>
  v === "urgent" ? "danger" : v === "high" ? "warning" : "neutral";

export const STATUSES = [
  { value: "open", label: "Open", tone: "accent" },
  { value: "in_progress", label: "In Progress", tone: "warning" },
  { value: "waiting_for_tenant", label: "Waiting for Tenant", tone: "danger" },
  { value: "resolved", label: "Resolved", tone: "success" },
  { value: "closed", label: "Closed", tone: "neutral" },
] as const satisfies readonly { value: string; label: string; tone: Tone }[];

/** The tenant sees "Waiting for You" rather than "Waiting for Tenant". */
export const statusLabel = (v?: string, tenant = false) =>
  tenant && v === "waiting_for_tenant"
    ? "Waiting for You"
    : (STATUSES.find((s) => s.value === v)?.label ?? "—");
export const statusTone = (v?: string): Tone =>
  STATUSES.find((s) => s.value === v)?.tone ?? "neutral";

/** Statuses a support agent may move a ticket to from each status. */
export const STAFF_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "waiting_for_tenant", "resolved", "closed"],
  in_progress: ["waiting_for_tenant", "resolved", "closed"],
  waiting_for_tenant: ["in_progress", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

export const REOPEN_WINDOW_DAYS = 14;

export const LIMITS = {
  subjectMin: 5,
  subjectMax: 160,
  descriptionMin: 10,
  descriptionMax: 10_000,
  replyMax: 10_000,
  detailMax: 2_000,
  moduleMax: 80,
  attachmentsPerMessage: 5,
  attachmentBytes: 10 * 1024 * 1024,
};

// Category-specific optional fields (the gateway drops anything else).
export const DETAIL_FIELDS: Record<
  string,
  { key: string; label: string; multiline?: boolean; placeholder?: string }[]
> = (() => {
  const bug = [
    {
      key: "stepsToReproduce",
      label: "Steps to reproduce",
      multiline: true,
      placeholder: "1. Open …\n2. Click …",
    },
    { key: "expectedBehavior", label: "What you expected", multiline: true },
    { key: "actualBehavior", label: "What happened instead", multiline: true },
    { key: "errorMessage", label: "Error message" },
    {
      key: "browser",
      label: "Browser or device",
      placeholder: "e.g. Chrome 131 on Windows",
    },
  ];
  const idea = [
    { key: "problem", label: "Problem you’re facing", multiline: true },
    { key: "proposedSolution", label: "Proposed solution", multiline: true },
    { key: "expectedBenefit", label: "Expected benefit", multiline: true },
  ];
  return {
    bug_report: bug,
    technical_issue: bug,
    billing: [
      {
        key: "invoiceReference",
        label: "Invoice or transaction reference",
        placeholder: "e.g. inv_Ox1… or pay_…",
      },
    ],
    feature_request: idea,
    improvement: idea,
    general: [],
    security: [],
  };
})();

/** Praesto modules, for "affected module". Free text is also accepted. */
export const MODULES = [
  "Today / Dashboard",
  "Attendance",
  "Leave",
  "Work From Home",
  "Employees",
  "Recruitment",
  "Payroll",
  "Performance",
  "Assets",
  "Helpdesk",
  "Announcements & Policies",
  "Chat",
  "Settings",
  "Subscription & Billing",
  "Mobile app",
  "Other",
];

// Attachments: the gateway verifies the bytes; this map only picks the
// declared type from the extension (browsers report .log/.csv inconsistently).
export const ATTACHMENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".csv": "text/csv",
};
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).join(",");

type U = {
  isSuperUser?: boolean;
  tenantRole?: string;
  permissions?: string[];
  isSupportAgent?: boolean;
} | null;
const perm = (u: U, action: string) =>
  hasPermission("Support", action, "-", u?.isSuperUser, u?.permissions || []);

export const canRaiseSupport = (u: U) =>
  Boolean(
    u?.isSuperUser ||
    ["owner", "admin", "hr"].includes(u?.tenantRole ?? "") ||
    perm(u, "raise_tickets"),
  );
export const canViewOrgSupport = (u: U) =>
  Boolean(
    u?.isSuperUser ||
    ["owner", "admin"].includes(u?.tenantRole ?? "") ||
    perm(u, "view_org_tickets"),
  );
export const isSupportAgent = (u: U) => Boolean(u?.isSupportAgent);
