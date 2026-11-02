import { useContext, useState } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate } from "@next/motion";
import {
  BarList,
  Button,
  ChartBlock,
  ChartBodySkeleton,
  ChartGrid,
  Columns,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Metric,
  Metrics,
  MetricsSkeleton,
  Page,
  Pagination,
  SERIES,
  SearchField,
  Section,
  Select,
  TextArea,
  TextInput,
  type Column,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fmtNumber } from "@next/lib/format";
import { PAYMENT_COLUMNS } from "./Tenants";
import {
  LedgerNote,
  Note,
  RangeControl,
  billingLabel,
  bucketLabel,
  canManageBilling,
  money,
  pct,
  planLabel,
  rangeLabel,
  subStatus,
  useConsoleData,
  useRange,
} from "./shared";
import s from "./platformAdmin.module.css";

// ── Subscriptions ───────────────────────────────────────────────────────────

function TenantList({
  title,
  rows,
  dateLabel,
  empty,
  extra,
}: {
  title: string;
  rows: any[];
  dateLabel: string;
  empty: string;
  extra?: (r: any) => string;
}) {
  const navigate = useTransitionNavigate();
  return (
    <Section
      title={title}
      detail={rows.length ? String(rows.length) : undefined}
    >
      {rows.length === 0 ? (
        <Note>{empty}</Note>
      ) : (
        <ul className="px-hairline-list">
          {rows.slice(0, 10).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="px-link-button"
                onClick={() => navigate(`/platform-admin/tenants/${r.id}`)}
              >
                {r.name}
              </button>
              <span className="px-meta">
                {" "}
                · {planLabel(r.planTier)}{" "}
                {billingLabel(r.billing).toLowerCase()} · {dateLabel}{" "}
                {fmtDate(r.at)}
                {extra && ` · ${extra(r)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function PlatformSubscriptions() {
  const r = useRange();
  const {
    data: d,
    error,
    loading,
    refetch,
  } = useConsoleData<any>(
    r.query ? API_ENDPOINTS.PLATFORM_ADMIN_SUBSCRIPTIONS(r.query) : null,
  );
  const c = d?.counts;
  return (
    <Page
      title="Subscriptions"
      subtitle="Praesto Platform Console"
      description="Lifecycle states as each organisation’s subscription records them, and what needs attention. Changes to a subscription are made by the organisation’s owner or by Razorpay, not here."
      actions={
        <Button icon="refresh" onClick={refetch} busy={loading && !!d}>
          Refresh
        </Button>
      }
    >
      <div className={s.stack}>
        <RangeControl r={r} />
        {error && !d ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !d ? (
          <>
            <MetricsSkeleton count={5} />
            <ChartBodySkeleton />
          </>
        ) : (
          <>
            <Metrics label="Subscriptions">
              <Metric
                label="Paying"
                value={c.paying}
                tone="success"
                note={`${money(d.mrr.mrr)} MRR`}
              />
              <Metric label="Trial" value={c.trialing} />
              <Metric
                label="Past Due"
                value={c.pastDue}
                tone={c.pastDue ? "warning" : undefined}
              />
              <Metric label="Cancelled" value={c.cancelled} />
              <Metric label="Expired" value={c.expired} />
            </Metrics>
            <Metrics label="Trials in the period">
              <Metric
                size="sm"
                label="Trial → Paid"
                value={
                  d.trials.rate == null
                    ? "—"
                    : `${Math.round(d.trials.rate * 100)}%`
                }
                note={`${d.trials.converted} of ${d.trials.ended} trials ended ${rangeLabel(d.range)}`}
              />
              <Metric
                size="sm"
                label="Ended Unconverted"
                value={d.trials.expiredUnconverted}
              />
              <Metric
                size="sm"
                label="Trials Started"
                value={d.trials.started}
              />
            </Metrics>
            <ChartGrid>
              <ChartBlock title="By Status" note="All organisations">
                <BarList
                  label="Organisations by subscription status"
                  data={Object.entries(c.byStatus).map(([k, v]) => ({
                    label: subStatus(k).label,
                    value: v as number,
                  }))}
                />
              </ChartBlock>
              <ChartBlock title="Paying by Plan">
                <BarList
                  label="Paying organisations by plan"
                  color={SERIES[3]}
                  data={Object.entries(c.byPlan).map(([k, v]) => ({
                    label: planLabel(k),
                    value: v as number,
                  }))}
                />
              </ChartBlock>
            </ChartGrid>
            <div className={s.lists}>
              <TenantList
                title="Past Due"
                rows={d.lists.pastDue}
                dateLabel="period ended"
                empty="No renewals are failing."
              />
              <TenantList
                title="Trials Ending in 7 Days"
                rows={d.lists.trialsEndingSoon}
                dateLabel="ends"
                empty="No trials end this week."
              />
              <TenantList
                title="Renewing in 30 Days"
                rows={d.lists.renewingSoon}
                dateLabel="renews"
                empty="No paying organisation renews in the next 30 days."
              />
              <TenantList
                title="Cancelled, Access Ending in 30 Days"
                rows={d.lists.endingSoon}
                dateLabel="access ends"
                empty="No cancelled organisation loses access in the next 30 days."
              />
              <TenantList
                title="Scheduled Plan Changes"
                rows={d.lists.pendingChanges}
                dateLabel="takes effect"
                empty="No upgrades or downgrades are scheduled."
                extra={(x) =>
                  `→ ${planLabel(x.toPlanTier)} ${billingLabel(x.toBilling).toLowerCase()}`
                }
              />
            </div>
            <Note>
              Churn and renewal rates aren’t shown: organisations store only
              their current status, not when it changed.
            </Note>
          </>
        )}
      </div>
    </Page>
  );
}

// ── Payments ────────────────────────────────────────────────────────────────

export function PlatformPayments() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [filters, setFilters] = useState({ status: "", from: "", to: "" });
  const dates =
    filters.from && filters.to && filters.from <= filters.to
      ? `&from=${filters.from}&to=${filters.to}`
      : "";
  const params = `${filters.status ? `&status=${filters.status}` : ""}${dates}`;
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.PLATFORM_ADMIN_PAYMENTS(p, l, `${searchParam(q)}${params}`),
    { deps: [params], listKeys: ["payments"] },
  );
  const [syncOpen, setSyncOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const syncAll = async () => {
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
        API_ENDPOINTS.PLATFORM_ADMIN_BILLING_SYNC,
        { reason },
      );
      setAlert({
        open: true,
        message: res.data?.message ?? "Synced.",
        severity: "success",
      });
      setSyncOpen(false);
      setReason("");
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "tenant",
      header: "Organisation",
      priority: "secondary",
      stackLabel: "Org",
      render: (p) =>
        p.tenantName ?? <span className={s.mono}>{p.tenantId}</span>,
    },
    ...PAYMENT_COLUMNS,
  ];

  return (
    <Page
      title="Payments"
      subtitle="Praesto Platform Console"
      description="Razorpay subscription payments, one row per Razorpay payment. Hover a failed payment’s status for Razorpay’s reason. No card or bank details are stored."
      actions={
        canManageBilling(user) && (
          <Button icon="download" onClick={() => setSyncOpen(true)}>
            Sync Payments from Razorpay
          </Button>
        )
      }
      tabs={
        <SearchField
          label="Organisation, or pay_/inv_/sub_ ID"
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
            aria-label="Status"
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({ ...f, status: e.target.value }))
            }
          >
            <option value="">All statuses</option>
            <option value="captured">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="pending">Pending</option>
          </Select>
          <Field label="From">
            <TextInput
              type="date"
              value={filters.from}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: e.target.value }))
              }
            />
          </Field>
          <Field label="To">
            <TextInput
              type="date"
              value={filters.to}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to: e.target.value }))
              }
            />
          </Field>
        </div>
        <DataTable
          label="Payments"
          columns={columns}
          rows={list.data}
          rowId={(p) => String(p.id)}
          loading={list.loading}
          empty={{
            icon: "card",
            title: "No payments match",
            body: "Try another filter. If the ledger is new, sync payments from Razorpay once.",
          }}
          footer={<Pagination {...list.pageProps} />}
        />
      </div>
      <ConfirmDialog
        open={syncOpen}
        onClose={() => !busy && setSyncOpen(false)}
        onConfirm={() => void syncAll()}
        busy={busy}
        tone="accent"
        title="Sync payments from Razorpay?"
        description="Reads every organisation’s subscription invoices from Razorpay and records their payments in the billing ledger. Read-only towards Razorpay and towards subscriptions — nothing is charged or changed. Recorded in the audit log."
        confirmLabel="Sync Payments"
      >
        <Field label="Reason (required)">
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Initial import of payment history"
          />
        </Field>
      </ConfirmDialog>
    </Page>
  );
}

// ── Revenue ─────────────────────────────────────────────────────────────────

export function PlatformRevenue() {
  const r = useRange();
  const {
    data: d,
    error,
    loading,
    refetch,
  } = useConsoleData<any>(
    r.query ? API_ENDPOINTS.PLATFORM_ADMIN_REVENUE(r.query) : null,
  );
  const currencies = Object.keys(d?.collections ?? {});
  const inr = d?.collections?.INR;
  const prev = d?.previousCollections?.INR;
  const change =
    inr && prev?.net
      ? Math.round(((inr.net - prev.net) / prev.net) * 1000) / 10
      : null;
  const mrrSeries = d?.billedMrr ?? [];
  const mom =
    mrrSeries.length >= 2 && mrrSeries[mrrSeries.length - 2].value > 0
      ? Math.round(
          ((mrrSeries[mrrSeries.length - 1].value -
            mrrSeries[mrrSeries.length - 2].value) /
            mrrSeries[mrrSeries.length - 2].value) *
            1000,
        ) / 10
      : null;

  return (
    <Page
      title="Revenue"
      subtitle="Praesto Platform Console"
      description="Cash actually collected (from Razorpay payments, after refunds) is kept apart from recurring revenue estimated from current subscriptions."
      actions={
        <Button icon="refresh" onClick={refetch} busy={loading && !!d}>
          Refresh
        </Button>
      }
    >
      <div className={s.stack}>
        <RangeControl r={r} />
        {error && !d ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !d ? (
          <>
            <MetricsSkeleton count={4} />
            <ChartBodySkeleton />
          </>
        ) : (
          <>
            <LedgerNote ledger={d.ledger} />
            <Section title="Recurring Revenue" detail="Estimated, now">
              <Metrics label="Recurring revenue">
                <Metric
                  label="MRR (Run-Rate)"
                  value={money(d.mrr.mrr)}
                  note="Active paid plans at list price; annual ÷ 12"
                />
                <Metric
                  label="ARR (Run-Rate)"
                  value={money(d.mrr.arr)}
                  note="MRR × 12"
                />
                <Metric
                  label="Billed MRR, Latest Month"
                  value={money(mrrSeries[mrrSeries.length - 1]?.value ?? 0)}
                  note={`${pct(mom)} month on month · from charges`}
                />
                <Metric
                  label="Paying Organisations"
                  value={fmtNumber(d.mrr.payingTenants)}
                />
              </Metrics>
            </Section>
            <Section title="Collected" detail={rangeLabel(d.range)}>
              {currencies.length === 0 ? (
                <Note>No payments were recorded in this period.</Note>
              ) : (
                currencies.map((cur) => {
                  const c = d.collections[cur];
                  return (
                    <Metrics key={cur} label={`Collected in ${cur}`}>
                      <Metric
                        label={`Net Collected · ${cur}`}
                        value={money(c.net, cur)}
                        note={
                          cur === "INR"
                            ? `${pct(change)} vs previous period`
                            : undefined
                        }
                      />
                      <Metric
                        label="Gross"
                        value={money(c.gross, cur)}
                        note={`${c.successful} successful payments`}
                      />
                      <Metric
                        label="Refunded"
                        value={money(c.refunds, cur)}
                        note={`${c.refunded} payments`}
                      />
                      <Metric
                        label="Avg. per Paying Org"
                        value={money(d.arpa[cur] ?? 0, cur)}
                        note={`${c.failed} failed · ${c.pending} pending (not revenue)`}
                      />
                    </Metrics>
                  );
                })
              )}
              <Note>
                Amounts are as charged by Razorpay. Plans carry no separate tax
                line in Praesto, so these are gross of any tax included in the
                price.
              </Note>
            </Section>
            <ChartGrid>
              <ChartBlock title="Net Collected by Month" note="INR">
                <Columns
                  label="Net collected by month"
                  color={SERIES[2]}
                  format={(v) => money(v)}
                  data={(d.byMonth ?? []).map((b: any) => ({
                    label: bucketLabel(b.key),
                    value: b.value,
                  }))}
                />
              </ChartBlock>
              <ChartBlock
                title="Billed MRR"
                note="Month end, from charged periods"
              >
                <Columns
                  label="Billed MRR by month"
                  color={SERIES[0]}
                  format={(v) => money(v)}
                  data={mrrSeries.map((b: any) => ({
                    label: bucketLabel(b.key),
                    value: b.value,
                  }))}
                />
              </ChartBlock>
              <ChartBlock title="By Plan" note="Net collected, INR">
                <BarList
                  label="Net collected by plan"
                  color={SERIES[3]}
                  format={(v) => money(v)}
                  data={Object.entries(d.byPlan?.INR ?? {}).map(([k, v]) => ({
                    label: planLabel(k),
                    value: v as number,
                  }))}
                />
              </ChartBlock>
              <ChartBlock title="By Billing Period" note="Net collected, INR">
                <BarList
                  label="Net collected by billing period"
                  color={SERIES[6]}
                  format={(v) => money(v)}
                  data={Object.entries(d.byBilling?.INR ?? {}).map(
                    ([k, v]) => ({
                      label: billingLabel(k),
                      value: v as number,
                    }),
                  )}
                />
              </ChartBlock>
            </ChartGrid>
          </>
        )}
      </div>
    </Page>
  );
}
