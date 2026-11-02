import { useContext, useState } from "react";
import { useParams } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate } from "@next/motion";
import {
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  KeyValues,
  KeyValuesSkeleton,
  Metric,
  Metrics,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  Section,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  type Column,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fmtDateTime, fmtNumber, fromNow } from "@next/lib/format";
import {
  KIND_LABEL,
  Note,
  SUBSCRIPTION_STATUS,
  billingLabel,
  canManageBilling,
  canViewBilling,
  money,
  payStatus,
  planLabel,
  subStatus,
  useConsoleData,
} from "./shared";
import s from "./platformAdmin.module.css";

const FILTER_DEFAULTS = {
  status: "",
  plan: "",
  kind: "",
  account: "",
  access: "",
  payment: "",
  registeredFrom: "",
  registeredTo: "",
  minEmployees: "",
  maxEmployees: "",
  sort: "created_desc",
};
type Filters = typeof FILTER_DEFAULTS;

const filterQuery = (f: Filters) =>
  Object.entries(f)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join("");

export default function PlatformTenants() {
  const { user } = useContext(UserContext);
  const navigate = useTransitionNavigate();
  const withBilling = canViewBilling(user);
  const [filters, setFilters] = useState<Filters>(FILTER_DEFAULTS);
  // Date filters apply only once both ends make sense.
  const query =
    filters.registeredFrom &&
    filters.registeredTo &&
    filters.registeredFrom > filters.registeredTo
      ? { ...filters, registeredFrom: "", registeredTo: "" }
      : filters;
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.PLATFORM_ADMIN_TENANTS(
        p,
        l,
        `${searchParam(q)}${filterQuery(query)}`,
      ),
    { deps: [filterQuery(query)], listKeys: ["tenants"] },
  );
  const set = (k: keyof Filters) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));

  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Organisation",
      priority: "primary",
      render: (t) => (
        <PrimaryCell
          title={t.name}
          subtitle={<span className={s.mono}>{t.id}</span>}
        />
      ),
    },
    {
      key: "plan",
      header: "Plan",
      priority: "secondary",
      stackLabel: "Plan",
      render: (t) => `${planLabel(t.planTier)} · ${billingLabel(t.billing)}`,
    },
    {
      key: "employees",
      header: "Employees",
      align: "right",
      priority: "secondary",
      stackLabel: "Employees",
      render: (t) => (
        <span className="px-num" title={`${t.activeEmployees} active`}>
          {fmtNumber(t.employees)}
        </span>
      ),
    },
    {
      key: "members",
      header: "Users",
      align: "right",
      priority: "hidden",
      render: (t) => <span className="px-num">{fmtNumber(t.members)}</span>,
    },
    {
      key: "created",
      header: "Registered",
      priority: "hidden",
      render: (t) => <span className="px-num">{fmtDate(t.createdAt)}</span>,
    },
    {
      key: "renewal",
      header: "Period / Trial Ends",
      priority: "hidden",
      render: (t) => (
        <span className="px-num">
          {fmtDate(
            t.subscriptionStatus === "trialing"
              ? t.trialEndsAt
              : t.planExpiresAt,
          )}
        </span>
      ),
    },
    ...(withBilling
      ? [
          {
            key: "payment",
            header: "Last Payment",
            priority: "hidden",
            render: (t: any) =>
              t.latestPayment ? (
                <StatusBadge
                  tone={payStatus(t.latestPayment.status).tone}
                  plain
                >
                  {payStatus(t.latestPayment.status).label} ·{" "}
                  {fmtDate(t.latestPayment.paidAt)}
                </StatusBadge>
              ) : (
                <span className="px-tertiary">None recorded</span>
              ),
          } as Column<any>,
        ]
      : []),
    {
      key: "signin",
      header: "Last Sign-In",
      priority: "hidden",
      render: (t) =>
        t.lastSignInAt ? (
          fromNow(t.lastSignInAt)
        ) : (
          <span className="px-tertiary">Never</span>
        ),
    },
    {
      key: "status",
      header: "Subscription",
      priority: "trailing",
      render: (t) => (
        <StatusBadge tone={subStatus(t.subscriptionStatus).tone}>
          {subStatus(t.subscriptionStatus).label}
          {!t.isActive && " · Deactivated"}
        </StatusBadge>
      ),
    },
  ];

  return (
    <Page
      title="Tenants"
      subtitle="Praesto Platform Console"
      description="Every customer organisation with its subscription, size and recent activity. Employee details are never shown here — only counts."
      tabs={
        <SearchField
          label="Organisation name, slug or tenant ID"
          value={list.query}
          onChange={(e) => list.search(e.target.value)}
          toolbarWidth={300}
          trailing
        />
      }
    >
      <div className={s.stack}>
        <div className={s.filters} role="group" aria-label="Filters">
          <Select
            aria-label="Subscription status"
            value={filters.status}
            onChange={set("status")}
          >
            <option value="">All statuses</option>
            {Object.entries(SUBSCRIPTION_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Plan" value={filters.plan} onChange={set("plan")}>
            <option value="">All plans</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="enterprise">Enterprise</option>
          </Select>
          <Select
            aria-label="Trial or paid"
            value={filters.kind}
            onChange={set("kind")}
          >
            <option value="">Trial and paid</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Access"
            value={filters.access}
            onChange={set("access")}
          >
            <option value="">Any access</option>
            <option value="yes">Has access now</option>
            <option value="no">Locked out</option>
          </Select>
          <Select
            aria-label="Account"
            value={filters.account}
            onChange={set("account")}
          >
            <option value="">Any account status</option>
            <option value="active">Account active</option>
            <option value="inactive">Account deactivated</option>
          </Select>
          {withBilling && (
            <Select
              aria-label="Last payment"
              value={filters.payment}
              onChange={set("payment")}
            >
              <option value="">Any last payment</option>
              <option value="captured">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="none">None recorded</option>
            </Select>
          )}
          <Field label="Registered from">
            <TextInput
              type="date"
              value={filters.registeredFrom}
              onChange={set("registeredFrom")}
            />
          </Field>
          <Field label="Registered to">
            <TextInput
              type="date"
              value={filters.registeredTo}
              onChange={set("registeredTo")}
            />
          </Field>
          <Field label="Min. employees">
            <TextInput
              type="number"
              min={0}
              inputMode="numeric"
              value={filters.minEmployees}
              onChange={set("minEmployees")}
            />
          </Field>
          <Field label="Max. employees">
            <TextInput
              type="number"
              min={0}
              inputMode="numeric"
              value={filters.maxEmployees}
              onChange={set("maxEmployees")}
            />
          </Field>
          <Select aria-label="Sort" value={filters.sort} onChange={set("sort")}>
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="name_asc">Name A–Z</option>
            <option value="employees_desc">Most employees</option>
            <option value="renewal_asc">Period ending soonest</option>
          </Select>
        </div>
        <DataTable
          label="Tenant organisations"
          columns={columns}
          rows={list.data}
          rowId={(t) => String(t.id)}
          loading={list.loading}
          onRowClick={(t) => navigate(`/platform-admin/tenants/${t.id}`)}
          empty={{
            icon: "org",
            title: "No organisations match",
            body: "Try another filter, or clear the search.",
          }}
          footer={<Pagination {...list.pageProps} />}
        />
      </div>
    </Page>
  );
}

const USAGE_LABEL: Record<string, string> = {
  attendance: "Attendance records",
  leave: "Leave applications",
  jobs: "Job openings created",
  payroll: "Payroll runs",
  helpdesk: "Helpdesk tickets",
};

export function PlatformTenantDetail() {
  const { tenantId = "" } = useParams();
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const {
    data: d,
    error,
    loading,
    refetch,
  } = useConsoleData<any>(API_ENDPOINTS.PLATFORM_ADMIN_TENANT(tenantId));
  const [syncOpen, setSyncOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const sub = d?.subscription;

  const sync = async () => {
    if (reason.trim().length < 5) {
      setAlert({
        open: true,
        message: "Give a short reason first.",
        severity: "error",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post(
        API_ENDPOINTS.PLATFORM_ADMIN_TENANT_SYNC(tenantId),
        { reason },
      );
      setAlert({
        open: true,
        message: res.data?.message ?? "Synced.",
        severity: "success",
      });
      setSyncOpen(false);
      setReason("");
      refetch();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title={d?.organisation.name ?? "Organisation"}
      subtitle="Praesto Platform Console"
      back={{ to: "/platform-admin/tenants", label: "Tenants" }}
      actions={
        canManageBilling(user) &&
        sub?.hasRazorpaySubscription && (
          <Button icon="refresh" onClick={() => setSyncOpen(true)}>
            Sync from Razorpay
          </Button>
        )
      }
    >
      {error && !d ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !d ? (
        <KeyValuesSkeleton rows={8} />
      ) : (
        <div className={s.stack}>
          <Metrics label="Summary">
            <Metric
              label="Subscription"
              value={subStatus(sub.status).label}
              tone={subStatus(sub.status).tone}
              note={sub.hasAccess ? "Has access now" : "Locked out"}
            />
            <Metric
              label="Plan"
              value={planLabel(sub.planTier)}
              note={billingLabel(sub.billing)}
            />
            <Metric
              label="Employee Records"
              value={fmtNumber(d.workforce.records)}
              note={`${d.workforce.active} active · ${d.workforce.inactive} inactive`}
            />
            <Metric
              label="Last Sign-In"
              value={
                d.usage.lastSignInAt ? fromNow(d.usage.lastSignInAt) : "Never"
              }
              note={`${d.usage.signInsLast30Days} sign-ins in 30 days`}
            />
          </Metrics>

          <div className={s.detailGrid}>
            <Section title="Organisation">
              <KeyValues
                items={[
                  [
                    "Tenant ID",
                    <span className={s.mono}>{d.organisation.id}</span>,
                  ],
                  ["Slug", d.organisation.slug],
                  ["Registered", fmtDateTime(d.organisation.createdAt)],
                  [
                    "Account",
                    d.organisation.isActive ? "Active" : "Deactivated",
                  ],
                  ["Industry", d.organisation.industry],
                  ["Company size", d.organisation.companySize],
                  ["Domain", d.organisation.domain],
                  ["Website", d.organisation.website],
                  [
                    "Billing contact (owner)",
                    d.organisation.owner &&
                      [d.organisation.owner.name, d.organisation.owner.email]
                        .filter(Boolean)
                        .join(" · "),
                  ],
                  ["Help email", d.organisation.helpEmail],
                  ["Help phone", d.organisation.helpPhone],
                ]}
              />
            </Section>

            <Section title="Subscription">
              <KeyValues
                items={[
                  ["Status", subStatus(sub.status).label],
                  ["Type", KIND_LABEL[sub.kind]],
                  [
                    "Plan",
                    `${planLabel(sub.planTier)} · ${billingLabel(sub.billing)}`,
                  ],
                  [
                    "Monthly value",
                    sub.monthlyValue ? money(sub.monthlyValue) : null,
                  ],
                  [
                    "Trial",
                    sub.trialStartedAt &&
                      `${fmtDate(sub.trialStartedAt)} – ${fmtDate(sub.trialEndsAt)}`,
                  ],
                  ["First charge", sub.activatedAt && fmtDate(sub.activatedAt)],
                  [
                    sub.status === "cancelled"
                      ? "Access ends"
                      : "Current period ends",
                    sub.currentPeriodEndsAt && fmtDate(sub.currentPeriodEndsAt),
                  ],
                  [
                    "Scheduled change",
                    (sub.pendingPlanTier || sub.pendingBilling) &&
                      `${planLabel(sub.pendingPlanTier ?? sub.planTier)} · ${billingLabel(sub.pendingBilling ?? sub.billing)} on ${fmtDate(sub.pendingChangeAt)}`,
                  ],
                  ...(canViewBilling(user)
                    ? ([
                        [
                          "Razorpay subscription",
                          sub.razorpaySubscriptionId && (
                            <span className={s.mono}>
                              {sub.razorpaySubscriptionId}
                            </span>
                          ),
                        ],
                        [
                          "Payment method",
                          sub.paymentMethodSummary || sub.paymentMethod,
                        ],
                      ] as [string, any][])
                    : []),
                ]}
              />
            </Section>

            <Section title="Workforce" detail="Counts only">
              <KeyValues
                items={[
                  ...Object.entries(d.workforce.byStatus).map(
                    ([k, v]) => [k, fmtNumber(v as number)] as [string, string],
                  ),
                  ["User accounts", fmtNumber(d.workforce.userAccounts)],
                ]}
              />
            </Section>

            <Section title="Usage" detail="Last 30 days">
              <KeyValues
                items={[
                  ...(d.usage.last30Days
                    ? Object.entries(d.usage.last30Days).map(
                        ([k, v]) =>
                          [
                            USAGE_LABEL[k] ?? k,
                            v == null ? "Unavailable" : fmtNumber(v as number),
                          ] as [string, string],
                      )
                    : [
                        [
                          "Module activity",
                          "Unavailable (no tenant database)",
                        ] as [string, string],
                      ]),
                  ["Sign-ins", fmtNumber(d.usage.signInsLast30Days)],
                  [
                    "Open support tickets",
                    fmtNumber(d.usage.openSupportTickets),
                  ],
                ]}
              />
            </Section>
          </div>

          {d.payments && (
            <Section
              title="Payments"
              detail="Latest 25, from the billing ledger"
            >
              <DataTable
                label="Payments"
                rows={d.payments}
                rowId={(p: any) => p.id}
                columns={PAYMENT_COLUMNS}
                empty={{
                  icon: "card",
                  title: "No payments recorded",
                  body: "Nothing in the billing ledger for this organisation yet.",
                }}
              />
            </Section>
          )}

          <Section title="Administrative History">
            {d.audit.length === 0 ? (
              <Note>
                No platform administration actions on this organisation yet.
              </Note>
            ) : (
              <ul className="px-hairline-list">
                {d.audit.map((a: any) => (
                  <li key={a.id}>
                    <b>{a.description}</b>
                    <span className="px-meta">
                      {" "}
                      · {a.actor ?? "Unknown"} · {fmtDateTime(a.at)} ·{" "}
                      {a.result}
                      {a.reason && ` · “${a.reason}”`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      <ConfirmDialog
        open={syncOpen}
        onClose={() => !busy && setSyncOpen(false)}
        onConfirm={() => void sync()}
        busy={busy || loading}
        tone="accent"
        title="Sync this subscription from Razorpay?"
        description="Praesto re-reads this organisation’s subscription and payments from Razorpay and corrects its status, period end or a scheduled plan change if they have drifted — the same check the 6-hourly job runs. Nothing is charged, cancelled or refunded. The action and your reason are recorded in the audit log."
        confirmLabel="Sync Now"
      >
        <Field label="Reason (required)">
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Customer reports renewal charged but access locked"
          />
        </Field>
      </ConfirmDialog>
    </Page>
  );
}

export const PAYMENT_COLUMNS: Column<any>[] = [
  {
    key: "paidAt",
    header: "Date",
    priority: "secondary",
    render: (p) => <span className="px-num">{fmtDateTime(p.paidAt)}</span>,
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    priority: "primary",
    render: (p) => (
      <PrimaryCell
        title={money(p.amount, p.currency)}
        subtitle={
          p.amountRefunded
            ? `${money(p.amountRefunded, p.currency)} refunded`
            : undefined
        }
      />
    ),
  },
  {
    key: "plan",
    header: "Plan",
    priority: "hidden",
    render: (p) => `${planLabel(p.planTier)} · ${billingLabel(p.billing)}`,
  },
  {
    key: "ref",
    header: "Razorpay Payment",
    priority: "hidden",
    render: (p) => <span className={s.mono}>{p.razorpayPaymentId}</span>,
  },
  {
    key: "method",
    header: "Method",
    priority: "hidden",
    render: (p) => p.method ?? "—",
  },
  {
    key: "status",
    header: "Status",
    priority: "trailing",
    render: (p) => (
      <StatusBadge tone={payStatus(p.status).tone}>
        <span title={p.errorDescription ?? undefined}>
          {payStatus(p.status).label}
        </span>
      </StatusBadge>
    ),
  },
];
