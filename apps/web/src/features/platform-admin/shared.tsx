import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Banner,
  Field,
  SegmentedControl,
  TextInput,
  type Tone,
} from "@next/ui";
import { apiClient, errorMessage, isCanceled, unwrap } from "@next/lib/api";
import { fmtMoney } from "@next/lib/format";
import s from "./platformAdmin.module.css";

// Praesto Platform Console — shared vocabulary, access predicates and
// controls. The predicates only decide what to show: every request is
// authorised again by the gateway (requirePlatformAdmin).

export type PlatformAction =
  | "view_overview"
  | "view_tenants"
  | "view_billing"
  | "manage_billing"
  | "view_audit_logs"
  | "view_leads"
  | "manage_leads";

type U = { platformAdmin?: string[] } | null | undefined;
export const hasGrant = (u: U, action: PlatformAction) =>
  Boolean(u?.platformAdmin?.includes(action));
export const canOpenConsole = (u: U) => (u?.platformAdmin?.length ?? 0) > 0;
export const canViewOverview = (u: U) => hasGrant(u, "view_overview");
export const canViewTenants = (u: U) => hasGrant(u, "view_tenants");
export const canViewBilling = (u: U) => hasGrant(u, "view_billing");
export const canManageBilling = (u: U) => hasGrant(u, "manage_billing");
export const canViewAudit = (u: U) => hasGrant(u, "view_audit_logs");
export const canViewLeads = (u: U) => hasGrant(u, "view_leads");
export const canManageLeads = (u: U) => hasGrant(u, "manage_leads");

/** The first console page this person may open. */
export function consoleHome(u: U): string {
  if (canViewOverview(u)) return "/platform-admin";
  if (canViewTenants(u)) return "/platform-admin/tenants";
  if (canViewBilling(u)) return "/platform-admin/subscriptions";
  if (canViewLeads(u)) return "/platform-admin/leads";
  if (canViewAudit(u)) return "/platform-admin/audit-logs";
  return "/dashboard";
}

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const SUBSCRIPTION_STATUS: Record<
  string,
  { label: string; tone: Tone }
> = {
  trialing: { label: "Trial", tone: "accent" },
  active: { label: "Active", tone: "success" },
  grace_period: { label: "Past Due", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  cancelling: { label: "Cancelling", tone: "neutral" },
  expired: { label: "Expired", tone: "danger" },
};
export const subStatus = (v?: string | null) =>
  SUBSCRIPTION_STATUS[v ?? ""] ?? {
    label: v || "Unknown",
    tone: "neutral" as Tone,
  };

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  captured: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  pending: { label: "Pending", tone: "warning" },
};
export const payStatus = (v?: string | null) =>
  PAYMENT_STATUS[v ?? ""] ?? { label: v || "—", tone: "neutral" as Tone };

export const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};
export const planLabel = (v?: string | null) =>
  PLAN_LABEL[v ?? ""] ?? (v === "unmatched" ? "Other amount" : v || "—");
export const billingLabel = (v?: string | null) =>
  v === "annual" ? "Annual" : v === "monthly" ? "Monthly" : "Unknown";
export const KIND_LABEL: Record<string, string> = {
  paid: "Paid",
  trial: "Trial, never charged",
  never_paid: "No charge on record",
};

/** Integer minor units (paise) → "₹7,999". */
export const money = (minor?: number | null, currency = "INR") =>
  minor == null ? "—" : fmtMoney(minor / 100, currency);

export const pct = (v?: number | null) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`;

/** "+12% vs previous period", or nothing when there's no base. */
export const vsPrevious = (g?: number | null) =>
  g == null ? "No earlier period to compare" : `${pct(g)} vs previous period`;

// ── Data ────────────────────────────────────────────────────────────────────

/**
 * GET a console endpoint. Refetches only when the URL changes (or on
 * refetch), and aborts a superseded request — so changing the range never
 * leaves an older response to land on top of a newer one.
 */
export function useConsoleData<T = any>(url: string | null) {
  const [state, setState] = useState<{
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: !!url });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setState((cur) => ({ ...cur, loading: true, error: null }));
    apiClient
      .get(url, { signal: ctrl.signal })
      .then((r) =>
        setState({ data: unwrap<T>(r), error: null, loading: false }),
      )
      .catch((err) => {
        if (!isCanceled(err))
          setState((cur) => ({
            ...cur,
            error: errorMessage(err),
            loading: false,
          }));
      });
    return () => ctrl.abort();
  }, [url, nonce]);
  return { ...state, refetch: () => setNonce((n) => n + 1) };
}

// ── Date range (kept in the URL, so it carries across console pages) ───────

const PRESETS = [
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "12m", label: "12 Months" },
  { value: "ytd", label: "Year to Date" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
] as const;
type Preset = (typeof PRESETS)[number]["value"];

export function useRange() {
  const [params, setParams] = useSearchParams();
  const range = (params.get("range") as Preset) || "90d";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const custom = range === "custom";
  const ready = !custom || (!!from && !!to && from <= to);
  const query = custom
    ? ready
      ? `?from=${from}&to=${to}`
      : null
    : `?range=${range}`;
  const set = (next: Record<string, string | null>) =>
    setParams(
      (cur) => {
        const p = new URLSearchParams(cur);
        for (const [k, v] of Object.entries(next))
          if (v) p.set(k, v);
          else p.delete(k);
        return p;
      },
      { replace: true },
    );
  return { range, from, to, custom, ready, query, set };
}

export function RangeControl({ r }: { r: ReturnType<typeof useRange> }) {
  return (
    <div className={s.range}>
      <SegmentedControl<Preset>
        role="radiogroup"
        label="Date range"
        value={r.range}
        onChange={(v) =>
          r.set({
            range: v,
            ...(v !== "custom" && { from: null, to: null }),
          })
        }
        segments={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
      />
      {r.custom && (
        <div className={s.customRange} role="group" aria-label="Custom range">
          <Field label="From">
            <TextInput
              type="date"
              value={r.from}
              max={r.to || undefined}
              onChange={(e) => r.set({ from: e.target.value })}
            />
          </Field>
          <Field label="To">
            <TextInput
              type="date"
              value={r.to}
              min={r.from || undefined}
              onChange={(e) => r.set({ to: e.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/** "1 Oct – 31 Oct 2026 · IST", from the range the server resolved. */
export function rangeLabel(range?: { from: string; to: string } | null) {
  if (!range) return "";
  const f = new Date(range.from);
  const t = new Date(new Date(range.to).getTime() - 1);
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  };
  return `${f.toLocaleDateString("en-IN", opts)} – ${t.toLocaleDateString("en-IN", opts)}`;
}

/** Bucket key ("2026-11", "2026-11-02") → a short axis label. */
export function bucketLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d || 1));
  return d
    ? date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : date.toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
}

/** Says plainly that payment figures come from the ledger, and how far back. */
export function LedgerNote({
  ledger,
}: {
  ledger?: { payments: number; earliestPaymentAt: string | null } | null;
}) {
  if (!ledger) return null;
  return ledger.payments === 0 ? (
    <Banner tone="warning" title="No payments recorded yet">
      Payment figures come from the billing ledger, which fills from Razorpay
      webhooks and the 6-hourly sync. Run “Sync Payments from Razorpay” on the
      Payments page once to import past payments.
    </Banner>
  ) : (
    <p className="px-meta">
      Cash figures come from {ledger.payments.toLocaleString("en-IN")} Razorpay
      payment{ledger.payments === 1 ? "" : "s"} in the billing ledger
      {ledger.earliestPaymentAt &&
        `, the earliest on ${new Date(ledger.earliestPaymentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
      .
    </p>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={`px-meta ${s.note}`}>{children}</p>;
}
