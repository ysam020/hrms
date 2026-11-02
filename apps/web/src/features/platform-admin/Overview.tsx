import { useContext } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  BarList,
  Button,
  ChartBlock,
  ChartBodySkeleton,
  ChartGrid,
  Columns,
  ErrorState,
  Legend,
  Metric,
  Metrics,
  MetricsSkeleton,
  Page,
  SERIES,
  Section,
} from "@next/ui";
import { fmtNumber } from "@next/lib/format";
import {
  LedgerNote,
  Note,
  RangeControl,
  bucketLabel,
  canViewBilling,
  money,
  pct,
  planLabel,
  rangeLabel,
  subStatus,
  useConsoleData,
  useRange,
  vsPrevious,
} from "./shared";
import s from "./platformAdmin.module.css";

const toBars = (rows: { key: string; value: number }[] = []) =>
  rows.map((r) => ({ label: bucketLabel(r.key), value: r.value }));

/** The console's front page: is the business healthy and growing? */
export default function PlatformOverview() {
  const { user } = useContext(UserContext);
  const r = useRange();
  const { data, loading, error, refetch } = useConsoleData<any>(
    r.query ? API_ENDPOINTS.PLATFORM_ADMIN_OVERVIEW(r.query) : null,
  );
  const d = data;
  const showBilling = canViewBilling(user);
  const b = d?.billing;
  const inr = b?.collections?.INR;
  const otherCurrencies = Object.keys(b?.collections ?? {}).filter(
    (c) => c !== "INR",
  );

  return (
    <Page
      title="Platform Overview"
      subtitle="Praesto Platform Console"
      description="Customer organisations, their people and subscriptions, and what Praesto has collected. Praesto’s own organisation is excluded."
      actions={
        <Button icon="refresh" onClick={refetch} busy={loading && !!d}>
          Refresh
        </Button>
      }
    >
      <div className={s.stack}>
        <RangeControl r={r} />
        {d && <Note>{rangeLabel(d.range)} · calendar days in IST</Note>}
        {error && !d ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !d ? (
          <>
            <MetricsSkeleton count={4} />
            <MetricsSkeleton count={4} />
            <ChartBodySkeleton />
          </>
        ) : (
          <>
            <Section title="Tenants">
              <Metrics label="Tenants">
                <Metric
                  icon="org"
                  label="Organisations"
                  value={fmtNumber(d.tenants.total)}
                  note={`${d.tenants.withAccess} with access · ${d.tenants.withoutAccess} without`}
                />
                <Metric
                  label="New in Period"
                  value={fmtNumber(d.tenants.newInRange)}
                  note={vsPrevious(d.tenants.growth)}
                  tone={d.tenants.growth > 0 ? "success" : undefined}
                />
                <Metric
                  label="Signed In During Period"
                  value={fmtNumber(d.tenants.signedInInRange)}
                  note="Organisations with at least one sign-in"
                />
                <Metric
                  label="Account Status"
                  value={`${d.tenants.accountActive} active`}
                  note={`${d.tenants.accountInactive} deactivated`}
                />
              </Metrics>
            </Section>

            <Section title="People">
              <Metrics label="Employees">
                <Metric
                  icon="people"
                  label="Employee Records"
                  value={fmtNumber(d.employees.records)}
                  note={`${fmtNumber(d.employees.active)} active · ${fmtNumber(d.employees.inactive)} inactive`}
                />
                <Metric
                  label="Active, in Orgs with Access"
                  value={fmtNumber(d.employees.activeInTenantsWithAccess)}
                />
                <Metric
                  label="Average per Organisation"
                  value={d.employees.averagePerTenant}
                />
                <Metric
                  label="Records Added"
                  value={fmtNumber(d.employees.addedInRange)}
                  note={vsPrevious(d.employees.growth)}
                />
                <Metric
                  size="sm"
                  label="User Accounts"
                  value={fmtNumber(d.employees.userAccounts)}
                  note="Organisation memberships (sign-in accounts)"
                />
              </Metrics>
            </Section>

            <Section title="Subscriptions">
              <Metrics label="Subscriptions">
                <Metric
                  icon="card"
                  label="Paying"
                  value={fmtNumber(d.subscriptions.paying)}
                  note={`${d.subscriptions.renewingSoon} renew in the next 30 days`}
                  tone="success"
                />
                <Metric
                  label="On Trial"
                  value={fmtNumber(d.subscriptions.trialing)}
                  note={`${d.subscriptions.trialsEndingSoon} end in the next 7 days`}
                />
                <Metric
                  label="Past Due"
                  value={fmtNumber(d.subscriptions.pastDue)}
                  note="Renewal failed; Razorpay retrying"
                  tone={d.subscriptions.pastDue ? "warning" : undefined}
                />
                <Metric
                  label="Cancelled"
                  value={fmtNumber(d.subscriptions.cancelled)}
                  note={`${d.subscriptions.endingSoon} lose access in 30 days`}
                />
                <Metric
                  label="Expired"
                  value={fmtNumber(d.subscriptions.expired)}
                />
              </Metrics>
              <Metrics label="Trials">
                <Metric
                  size="sm"
                  label="Trial → Paid"
                  value={
                    d.trials.rate == null
                      ? "—"
                      : `${Math.round(d.trials.rate * 100)}%`
                  }
                  note={`${d.trials.converted} of ${d.trials.ended} trials that ended in the period`}
                />
                <Metric
                  size="sm"
                  label="Trials Started"
                  value={fmtNumber(d.trials.started)}
                />
                <Metric
                  size="sm"
                  label="Ended Unconverted"
                  value={fmtNumber(d.trials.expiredUnconverted)}
                />
              </Metrics>
            </Section>

            {showBilling && b && (
              <Section title="Revenue">
                <Metrics label="Revenue">
                  <Metric
                    icon="banknote"
                    label="MRR (Run-Rate)"
                    value={money(b.mrr.mrr)}
                    note={`${b.mrr.payingTenants} paying · list price, annual ÷ 12`}
                  />
                  <Metric
                    label="Billed MRR"
                    value={money(b.billedMrr.now)}
                    note={`${pct(b.billedMrr.growth)} vs 30 days ago · from charges`}
                  />
                  <Metric
                    label="Net Collected"
                    value={money(inr?.net ?? 0)}
                    note={`${money(inr?.gross ?? 0)} gross − ${money(inr?.refunds ?? 0)} refunded`}
                  />
                  <Metric
                    label="Payments"
                    value={`${inr?.successful ?? 0} paid`}
                    note={`${inr?.failed ?? 0} failed · ${inr?.pending ?? 0} pending`}
                    tone={inr?.failed ? "warning" : undefined}
                  />
                </Metrics>
                <Metrics label="MRR breakdown">
                  <Metric
                    size="sm"
                    label="From Monthly Plans"
                    value={money(b.mrr.fromMonthly)}
                  />
                  <Metric
                    size="sm"
                    label="From Annual Plans"
                    value={money(b.mrr.fromAnnual)}
                  />
                  <Metric
                    size="sm"
                    label="At Risk (Past Due)"
                    value={money(b.mrr.atRisk)}
                  />
                  <Metric
                    size="sm"
                    label="Non-Renewing"
                    value={money(b.mrr.nonRenewing)}
                    note="Cancelled, still in paid period"
                  />
                </Metrics>
                {otherCurrencies.length > 0 && (
                  <Note>
                    Also collected in {otherCurrencies.join(", ")} — shown
                    separately on the Revenue page, never added to INR.
                  </Note>
                )}
                <LedgerNote ledger={b.ledger} />
              </Section>
            )}

            <ChartGrid>
              <ChartBlock title="New Organisations" note="Registrations">
                <Columns
                  label="Organisations registered"
                  unit="organisations"
                  data={toBars(d.tenants.registrations)}
                />
              </ChartBlock>
              <ChartBlock
                title="Employee Records Added"
                note="Records created; not headcount history"
              >
                <Columns
                  label="Employee records added"
                  color={SERIES[1]}
                  unit="records"
                  data={toBars(d.employees.added)}
                />
              </ChartBlock>
              {showBilling && b && (
                <>
                  <ChartBlock title="Net Collected" note="INR, after refunds">
                    <Columns
                      label="Net collected"
                      color={SERIES[2]}
                      format={(v) => money(v)}
                      data={toBars(b.netSeries)}
                    />
                  </ChartBlock>
                  <ChartBlock title="Payment Outcomes" note="Paid vs failed">
                    <Legend
                      items={[
                        { label: "Paid", color: SERIES[2] },
                        { label: "Failed", color: SERIES[4] },
                      ]}
                    />
                    <Columns
                      label="Successful payments"
                      color={SERIES[2]}
                      height={110}
                      unit="paid"
                      data={toBars(b.paymentSeries.successful)}
                    />
                    <Columns
                      label="Failed payments"
                      color={SERIES[4]}
                      height={80}
                      unit="failed"
                      data={toBars(b.paymentSeries.failed)}
                    />
                  </ChartBlock>
                </>
              )}
              <ChartBlock
                title="Trial Conversions"
                note="First charges after a trial"
              >
                <Columns
                  label="Trial conversions"
                  color={SERIES[5]}
                  unit="conversions"
                  data={toBars(d.conversions)}
                />
              </ChartBlock>
              <ChartBlock
                title="Subscription Status"
                note="All organisations, now"
              >
                <BarList
                  label="Organisations by subscription status"
                  data={Object.entries(d.subscriptions.byStatus).map(
                    ([k, v]) => ({
                      label: subStatus(k).label,
                      value: v as number,
                    }),
                  )}
                />
              </ChartBlock>
              <ChartBlock
                title="Paying by Plan"
                note="Paying organisations, now"
              >
                <BarList
                  label="Paying organisations by plan"
                  color={SERIES[3]}
                  data={Object.entries(d.subscriptions.byPlan).map(
                    ([k, v]) => ({
                      label: planLabel(k),
                      value: v as number,
                    }),
                  )}
                />
              </ChartBlock>
              <ChartBlock
                title="Paying by Billing Period"
                note="Paying organisations, now"
              >
                <BarList
                  label="Paying organisations by billing period"
                  color={SERIES[6]}
                  data={[
                    {
                      label: "Monthly",
                      value: d.subscriptions.byBilling.monthly,
                    },
                    {
                      label: "Annual",
                      value: d.subscriptions.byBilling.annual,
                    },
                  ].filter((x) => x.value > 0)}
                />
              </ChartBlock>
            </ChartGrid>

            <Section
              title="Not Available Yet"
              detail="Shown as unavailable rather than estimated"
            >
              <ul className={s.unavailable}>
                {d.unavailable.map((u: any) => (
                  <li key={u.metric}>
                    <b>{u.metric}</b>
                    <span className="px-meta">{u.reason}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>
    </Page>
  );
}
