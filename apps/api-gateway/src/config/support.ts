// Tenant support (organisations → the Praesto team): the one place the
// vocabulary and rules live. The web app mirrors the keys/labels in
// apps/web/src/features/support/config.ts — keep them in step.

export const SUPPORT_CATEGORIES = {
  bug_report: {
    label: "Bug Report",
    description: "Something is not working as expected.",
  },
  technical_issue: {
    label: "Technical Issue",
    description: "An error, loading problem, or technical failure.",
  },
  billing: {
    label: "Billing & Subscription",
    description: "Subscription, invoice, or payment-related issues.",
  },
  feature_request: {
    label: "Feature Request",
    description: "Request a new capability in Praesto.",
  },
  improvement: {
    label: "Improvement Suggestion",
    description: "Suggest an improvement to an existing feature.",
  },
  general: {
    label: "General Inquiry",
    description: "Ask a general question about Praesto.",
  },
  security: {
    label: "Security Concern",
    description:
      "Report a possible security vulnerability or security-related issue.",
  },
} as const;

export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;
export const SUPPORT_CATEGORY_KEYS = Object.keys(SUPPORT_CATEGORIES) as [
  SupportCategory,
  ...SupportCategory[],
];

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_STATUSES = [
  "open",
  "in_progress",
  "waiting_for_tenant",
  "resolved",
  "closed",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** Statuses that still need something from the Praesto team or the tenant. */
export const ACTIVE_STATUSES: SupportStatus[] = [
  "open",
  "in_progress",
  "waiting_for_tenant",
];

// Transitions the support team may make. Closed is terminal: a tenant with a
// recurring problem raises a new ticket. Tenant-side moves are narrower and
// live in services/supportPolicy.ts (reopen, confirm-close, reply-wakes).
export const STAFF_TRANSITIONS: Record<SupportStatus, SupportStatus[]> = {
  open: ["in_progress", "waiting_for_tenant", "resolved", "closed"],
  in_progress: ["waiting_for_tenant", "resolved", "closed"],
  waiting_for_tenant: ["in_progress", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

/** A resolved ticket can be reopened by the tenant for this long. */
export const REOPEN_WINDOW_DAYS = 14;

/** Statuses a support agent may set alongside a public reply. */
export const REPLY_STATUS_OPTIONS: SupportStatus[] = [
  "waiting_for_tenant",
  "in_progress",
  "resolved",
];

// Optional category-specific fields; anything else in `details` is dropped.
export const DETAIL_FIELDS: Record<string, readonly string[]> = {
  bug_report: [
    "stepsToReproduce",
    "expectedBehavior",
    "actualBehavior",
    "errorMessage",
    "browser",
  ],
  technical_issue: [
    "stepsToReproduce",
    "expectedBehavior",
    "actualBehavior",
    "errorMessage",
    "browser",
  ],
  billing: ["invoiceReference"],
  feature_request: ["problem", "proposedSolution", "expectedBenefit"],
  improvement: ["problem", "proposedSolution", "expectedBenefit"],
  general: [],
  security: [],
};

export const SUPPORT_LIMITS = {
  subjectMin: 5,
  subjectMax: 160,
  descriptionMin: 10,
  descriptionMax: 10_000,
  replyMax: 10_000,
  detailMax: 2_000,
  moduleMax: 80,
} as const;

// Attachments: images, PDFs and plain text only. Each type is verified from
// the uploaded bytes (services/supportFiles.ts) — the extension and the
// browser's MIME claim alone are never trusted. SVG is excluded (scriptable),
// as are Office/zip formats (can't be verified without unpacking).
export const SUPPORT_ATTACHMENT_TYPES: Record<
  string,
  { extensions: string[]; inline: boolean }
> = {
  "image/png": { extensions: [".png"], inline: true },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], inline: true },
  "image/gif": { extensions: [".gif"], inline: true },
  "image/webp": { extensions: [".webp"], inline: true },
  "application/pdf": { extensions: [".pdf"], inline: false },
  "text/plain": { extensions: [".txt", ".log"], inline: false },
  "text/csv": { extensions: [".csv"], inline: false },
};

export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SUPPORT_ATTACHMENTS_PER_MESSAGE = 5;
/** Signed upload/download URLs live this long. */
export const SUPPORT_URL_TTL_SECONDS = 300;

export const ticketNoPrefix = (year: number) => `PRA-${year}-`;
