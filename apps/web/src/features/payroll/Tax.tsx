import dayjs from "dayjs";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate } from "@next/motion";
import {
  Tag,
  StatTiles,
  StatTile,
  EmptyState,
  AmountInput,
  Avatar,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  FormSection,
  Icon,
  SummaryRow,
  layout,
  Dialog,
  Field,
  Page,
  Pagination,
  PrimaryCell,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  Switch,
  TextArea,
  inlineCheckClass,
  type Column,
  type Tone,
  SectionsSkeleton,
  KeyValuesSkeleton,
} from "@next/ui";
import { apiClient, errorMessage, unwrap } from "@next/lib/api";
import { usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fmtMoney, personName } from "@next/lib/format";
import s from "./salary.module.css";

// Old-regime tax declarations (Classic: payroll/tax-declaration/*). Same
// endpoints and workflow: Draft → Submitted → Declared (or
// RevisionRequested) → ProofsSubmitted → Verified (or ProofRevisionRequested).
// Section codes and caps mirror Classic's LINE_ITEM_DEFS (not exported there).

export const LINE_ITEMS = [
  {
    code: "SEC80C",
    label: "Section 80C",
    hint: "PF, ELSS, life insurance, PPF",
    cap: 150000,
  },
  {
    code: "SEC80D_SELF",
    label: "Section 80D — Self & Family",
    hint: "Health insurance",
    cap: 25000,
  },
  {
    code: "SEC80D_PARENTS",
    label: "Section 80D — Parents",
    hint: "Health insurance",
    cap: 25000,
  },
  {
    code: "HOME_LOAN_INTEREST",
    label: "Home Loan Interest",
    hint: "Section 24(b)",
    cap: 200000,
  },
  { code: "NPS_80CCD1B", label: "NPS", hint: "Section 80CCD(1B)", cap: 50000 },
  {
    code: "OTHER",
    label: "Other Deductions",
    hint: "80G and others",
    cap: null as number | null,
  },
];

export function currentFinancialYear(d = new Date()) {
  const start = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  Draft: { label: "Draft", tone: "neutral" },
  Submitted: { label: "Awaiting Review", tone: "warning" },
  RevisionRequested: { label: "Revision Requested", tone: "danger" },
  Declared: { label: "Approved — Proofs Due", tone: "accent" },
  ProofsSubmitted: { label: "Proofs Under Review", tone: "warning" },
  ProofRevisionRequested: { label: "Proof Revision Requested", tone: "danger" },
  Verified: { label: "Verified", tone: "success" },
};
const StatusPill = ({ s: st }: { s?: string | null }) =>
  st ? (
    <StatusBadge tone={STATUS[st]?.tone ?? "neutral"}>
      {STATUS[st]?.label ?? st}
    </StatusBadge>
  ) : (
    <StatusBadge tone="neutral">New Regime</StatusBadge>
  );

type Item = { code: string; declaredAmount: number; proofAmount?: number };
type Declaration = {
  status: string | null;
  financialYear: string;
  monthlyRent?: number | null;
  isMetroCity?: boolean | null;
  lineItems?: Item[];
  revisionNotes?: Record<string, string> | null;
  employee?: any;
  updatedAt?: string;
};

// ── Employee: my declaration ────────────────────────────────────────────────

export function MyTaxDeclarationPage() {
  const { setAlert } = useContext(AlertContext);
  const fy = useMemo(() => currentFinancialYear(), []);
  const [decl, setDecl] = useState<Declaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [rent, setRent] = useState(0);
  const [metro, setMetro] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [proofs, setProofs] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<
    null | "draft" | "submit" | "proofs" | "start"
  >(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d: Declaration = unwrap(
        await apiClient.get(API_ENDPOINTS.GET_MY_DECLARATION(fy)),
      ) ?? { status: null, financialYear: fy };
      setDecl(d);
      setRent(d.monthlyRent ?? 0);
      setMetro(Boolean(d.isMetroCity));
      setAmounts(
        Object.fromEntries(
          (d.lineItems ?? []).map((i) => [i.code, i.declaredAmount ?? 0]),
        ),
      );
      setProofs(
        Object.fromEntries(
          (d.lineItems ?? []).map((i) => [i.code, i.proofAmount ?? 0]),
        ),
      );
    } catch (err) {
      setAlert({
        open: true,
        message: errorMessage(err, "Your tax declaration couldn’t be loaded."),
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [fy, setAlert]);
  useEffect(() => {
    load();
  }, [load]);

  const items = () =>
    LINE_ITEMS.map((d) => ({
      code: d.code,
      declaredAmount: amounts[d.code] ?? 0,
    }));
  const call = async (
    kind: NonNullable<typeof saving>,
    fn: () => Promise<unknown>,
    ok: string,
  ) => {
    setSaving(kind);
    try {
      await fn();
      setAlert({ open: true, message: ok, severity: "success" });
      await load();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(null);
    }
  };
  const saveDraft = () =>
    apiClient.post(API_ENDPOINTS.SAVE_DRAFT_DECLARATION, {
      financialYear: fy,
      monthlyRent: rent,
      isMetroCity: metro,
      lineItems: items(),
    });

  const status = decl?.status ?? null;
  const editable =
    status === null || status === "Draft" || status === "RevisionRequested";
  const proofsDue =
    status === "Declared" || status === "ProofRevisionRequested";
  const total = LINE_ITEMS.reduce(
    (a, d) => a + Math.min(amounts[d.code] ?? 0, d.cap ?? Infinity),
    0,
  );
  const notes = Object.entries(decl?.revisionNotes ?? {}).map(
    ([k, v]) => `${k === "general" ? "" : `${k}: `}${v}`,
  );

  const submitDeclaration = () =>
    call(
      "submit",
      async () => {
        await saveDraft();
        await apiClient.post(API_ENDPOINTS.SUBMIT_DECLARATION, {
          financialYear: fy,
        });
      },
      "Declaration submitted for review.",
    );
  const declaredTotal = LINE_ITEMS.reduce(
    (a, d) => a + (amounts[d.code] ?? 0),
    0,
  );
  const proofTotal = LINE_ITEMS.reduce((a, d) => a + (proofs[d.code] ?? 0), 0);

  const lineRow = (code: string) => {
    const d = LINE_ITEMS.find((x) => x.code === code)!;
    const amount = amounts[d.code] ?? 0;
    const over = d.cap != null && amount > d.cap;
    return (
      <div key={d.code} className={s.line}>
        <div className={s.lineText}>
          <span className={s.lineLabel}>{d.label}</span>
          <span className="px-meta">{d.hint}</span>
        </div>
        <div className={s.lineInputs}>
          {editable ? (
            <AmountInput
              aria-label={`${d.label} amount`}
              className={s.amount}
              value={amount}
              onValue={(n) => setAmounts((a) => ({ ...a, [d.code]: n }))}
            />
          ) : (
            <span className={`px-num ${s.amountReadOnly}`}>
              {fmtMoney(amount)}
            </span>
          )}
          {proofsDue && (
            <AmountInput
              aria-label={`${d.label} proof amount`}
              className={s.amount}
              value={proofs[d.code] ?? 0}
              onValue={(n) => setProofs((p) => ({ ...p, [d.code]: n }))}
            />
          )}
        </div>
        {d.cap != null ? (
          <div className={s.cap} data-over={over || undefined}>
            <span className={s.capMeter} aria-hidden>
              <span
                style={{ width: `${Math.min(1, amount / d.cap) * 100}%` }}
              />
            </span>
            <span className="px-meta">
              {over
                ? `Only ${fmtMoney(d.cap)} counts — the limit for this section`
                : `${fmtMoney(amount)} of ${fmtMoney(d.cap)} limit`}
            </span>
          </div>
        ) : (
          <div className={s.cap}>
            <span className="px-meta">
              No overall limit in this calculation
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Page
      title="My Tax Declaration"
      subtitle={`Financial year ${fy}`}
      width="wide"
      description={
        status === null
          ? undefined
          : "Declare what you’ll invest or spend this year under the Old Regime. Payroll uses it to lower your monthly TDS; HR verifies proofs later in the year."
      }
      actions={
        status !== null &&
        editable && (
          <>
            <Button
              icon="doc"
              data-tour="tax-draft"
              onClick={() => call("draft", saveDraft, "Draft saved.")}
              busy={saving === "draft"}
            >
              Save Draft
            </Button>
            <Button
              variant="primary"
              icon="check"
              busy={saving === "submit"}
              onClick={() => setConfirming(true)}
            >
              Submit for Review
            </Button>
          </>
        )
      }
    >
      {loading ? (
        <div style={{ display: "grid", gap: 28 }}>
          <Skeleton width={120} height={22} radius={11} />
          <SectionsSkeleton sections={2} fields={4} toggles={0} />
        </div>
      ) : status === null ? (
        <Card>
          <div className={s.regime}>
            <div className={s.regimeOption} data-current>
              <span className={s.regimeTitle}>
                New Regime <StatusBadge tone="success">Current</StatusBadge>
              </span>
              <p className="px-secondary">
                Lower slab rates and no declarations to make. Nothing to do
                here.
              </p>
            </div>
            <div className={s.regimeOption}>
              <span className={s.regimeTitle}>Old Regime</span>
              <p className="px-secondary">
                Declare 80C, 80D, HRA, home-loan interest and NPS. It can lower
                your monthly TDS if you have these expenses.
              </p>
              <div>
                <Button
                  variant="primary"
                  busy={saving === "start"}
                  onClick={() =>
                    call(
                      "start",
                      () =>
                        apiClient.post(API_ENDPOINTS.SAVE_DRAFT_DECLARATION, {
                          financialYear: fy,
                          lineItems: LINE_ITEMS.map((d) => ({
                            code: d.code,
                            declaredAmount: 0,
                          })),
                        }),
                      "Old Regime declaration started.",
                    )
                  }
                >
                  Switch to Old Regime
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className={layout.split}>
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            <TaxProgress status={status} />
            {(status === "RevisionRequested" ||
              status === "ProofRevisionRequested") && (
              <Banner tone="danger" title="HR asked for changes">
                {notes.join("; ") || "Review the amounts below and resubmit."}
              </Banner>
            )}
            {status === "Declared" && (
              <Banner tone="accent" title="Declaration approved — proofs due">
                Enter the amount each proof covers in the second column, then
                submit your proofs.
              </Banner>
            )}
            {status === "Verified" && (
              <Banner tone="success" title="Verified">
                Your proofs are verified for FY {fy}.
              </Banner>
            )}
            {proofsDue && (
              <div className={s.columnsHint} aria-hidden>
                <span>Declared</span>
                <span>Proof</span>
              </div>
            )}
            <FormSection
              icon="wfh"
              title="House Rent"
              description="For your HRA exemption. Payroll works out the exempt amount from your basic pay and HRA."
            >
              <div className={s.line}>
                <div className={s.lineText}>
                  <span className={s.lineLabel}>Monthly Rent</span>
                  <span className="px-meta">
                    {rent > 0
                      ? `${fmtMoney(rent * 12)} a year`
                      : "Leave at ₹0 if you don’t pay rent"}
                  </span>
                </div>
                <div className={s.lineInputs}>
                  {editable ? (
                    <AmountInput
                      aria-label="Monthly rent"
                      className={s.amount}
                      value={rent}
                      onValue={setRent}
                    />
                  ) : (
                    <span className={`px-num ${s.amountReadOnly}`}>
                      {fmtMoney(rent)}
                    </span>
                  )}
                </div>
              </div>
              <label className={`${s.line} ${inlineCheckClass}`}>
                <span className={s.lineText}>
                  <span className={s.lineLabel}>I live in a metro city</span>
                  <span className="px-meta">
                    Delhi, Mumbai, Kolkata or Chennai
                  </span>
                </span>
                <Switch
                  checked={metro}
                  onChange={setMetro}
                  label="Metro city"
                  disabled={!editable}
                />
              </label>
            </FormSection>
            <FormSection
              icon="trendUp"
              title="Investments"
              description="Section 80C: PF, ELSS, life insurance premiums, PPF, tuition fees and similar."
            >
              {lineRow("SEC80C")}
            </FormSection>
            <FormSection
              icon="heart"
              title="Health Insurance"
              description="Section 80D: premiums you pay for yourself, your family and your parents."
            >
              {lineRow("SEC80D_SELF")}
              {lineRow("SEC80D_PARENTS")}
            </FormSection>
            <FormSection
              icon="bank"
              title="Home Loan and Retirement"
              description="Interest on a loan for a house you live in, and your own NPS contributions."
            >
              {lineRow("HOME_LOAN_INTEREST")}
              {lineRow("NPS_80CCD1B")}
            </FormSection>
            <FormSection
              icon="percent"
              title="Other Deductions"
              description="Donations under 80G and other eligible deductions."
            >
              {lineRow("OTHER")}
            </FormSection>
          </div>
          <aside className={`${layout.rail} ${s.summary}`} aria-label="Summary">
            <div style={{ display: "grid", gap: 6 }}>
              <span className="px-meta">Status</span>
              <div>
                <StatusPill s={status} />
              </div>
            </div>
            <div>
              <SummaryRow label="Declared" value={fmtMoney(declaredTotal)} />
              <SummaryRow
                label="Over section limits"
                value={fmtMoney(Math.max(0, declaredTotal - total))}
              />
              {proofsDue && (
                <SummaryRow
                  label="Proofs entered"
                  value={fmtMoney(proofTotal)}
                />
              )}
              <SummaryRow
                label="Deductible after limits"
                value={fmtMoney(total)}
                emphasis
              />
            </div>
            <p className="px-meta">
              Monthly rent of {fmtMoney(rent)} is used separately for HRA and
              isn’t part of this total.
            </p>
            {proofsDue && (
              <Button
                variant="primary"
                block
                busy={saving === "proofs"}
                onClick={() =>
                  call(
                    "proofs",
                    () =>
                      apiClient.post(API_ENDPOINTS.SUBMIT_DECLARATION_PROOFS, {
                        financialYear: fy,
                        proofs,
                      }),
                    "Proofs submitted for verification.",
                  )
                }
              >
                Submit Proofs
              </Button>
            )}
          </aside>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await submitDeclaration();
          setConfirming(false);
        }}
        busy={saving === "submit"}
        tone="accent"
        title="Submit Declaration for Review?"
        confirmLabel="Submit"
        description={`HR will review it before it affects your TDS. You can’t edit it while it’s under review.`}
      >
        <div style={{ marginTop: 8 }}>
          <SummaryRow label="Monthly rent" value={fmtMoney(rent)} />
          <SummaryRow label="Metro city" value={metro ? "Yes" : "No"} />
          <SummaryRow label="Declared" value={fmtMoney(declaredTotal)} />
          <SummaryRow
            label="Deductible after limits"
            value={fmtMoney(total)}
            emphasis
          />
        </div>
      </ConfirmDialog>
    </Page>
  );
}

const TAX_STAGES = ["Declare", "HR Review", "Proofs", "Verified"];
const stageOf = (status: string | null): number =>
  status === "Submitted"
    ? 1
    : status === "Declared" || status === "ProofRevisionRequested"
      ? 2
      : status === "ProofsSubmitted"
        ? 3
        : status === "Verified"
          ? 4
          : 0;

/** Where the declaration is in its yearly workflow. */
function TaxProgress({ status }: { status: string | null }) {
  const at = stageOf(status);
  return (
    <ol className={s.stages} aria-label="Declaration progress">
      {TAX_STAGES.map((label, i) => {
        const state = i < at ? "done" : i === at ? "current" : "upcoming";
        return (
          <li
            key={label}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className={s.stageDot} aria-hidden>
              {state === "done" ? <Icon name="check" size={12} /> : i + 1}
            </span>
            {label}
            {state === "done" && <span className="px-sr-only"> (done)</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ── HR: all declarations ────────────────────────────────────────────────────

const LIST_STATUSES = [
  "All",
  "Submitted",
  "ProofsSubmitted",
  "Declared",
  "RevisionRequested",
  "Verified",
];

export function TaxDeclarationsPage() {
  const navigate = useTransitionNavigate();
  const [fy, setFy] = useState(() => currentFinancialYear());
  const [status, setStatus] = useState("Submitted");
  const list = usePagedList(
    (p, l) =>
      API_ENDPOINTS.LIST_DECLARATIONS(
        fy,
        p,
        l,
        status !== "All" ? `&status=${status}` : "",
      ),
    {
      deps: [fy, status],
      listKeys: ["declarations"],
    },
  );
  const years = useMemo(() => {
    const y = Number(currentFinancialYear().slice(0, 4));
    return [y, y - 1, y - 2].map(
      (s0) => `${s0}-${String((s0 + 1) % 100).padStart(2, "0")}`,
    );
  }, []);
  const columns: Column<any>[] = [
    {
      key: "who",
      header: "Employee",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          leading={<Avatar name={personName(r.employee)} size={28} />}
          title={personName(r.employee)}
          subtitle={r.employee?.username}
        />
      ),
    },
    {
      key: "updated",
      header: "Updated",
      priority: "secondary",
      render: (r) => <span className="px-num">{fmtDate(r.updatedAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => <StatusPill s={r.status} />,
    },
  ];
  return (
    <Page
      title="Tax Declarations"
      tabs={
        <>
          <SegmentedControl
            role="radiogroup"
            label="Financial year"
            value={fy}
            onChange={setFy}
            segments={years.map((y) => ({ value: y, label: `FY ${y}` }))}
          />
          <SegmentedControl
            role="radiogroup"
            label="Status"
            value={status}
            onChange={setStatus}
            segments={LIST_STATUSES.map((v) => ({
              value: v,
              label: v === "All" ? "All" : (STATUS[v]?.label ?? v),
            }))}
          />
        </>
      }
    >
      <DataTable
        label="Tax declarations"
        tour="taxreview-table"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.userId ?? r.id)}
        loading={list.loading}
        onRowClick={(r) =>
          navigate(
            `/payroll/tax-declarations/${r.userId}?financialYear=${r.financialYear ?? fy}`,
          )
        }
        stickyOffset={52}
        empty={{ icon: "doc", title: "No declarations here" }}
        footer={<Pagination {...list.pageProps} />}
      />
    </Page>
  );
}

// ── HR: review one declaration ──────────────────────────────────────────────

export function TaxReviewPage() {
  const { userId = "" } = useParams();
  const [params] = useSearchParams();
  const fy = params.get("financialYear") || currentFinancialYear();
  const { setAlert } = useContext(AlertContext);
  const [d, setD] = useState<Declaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [revise, setRevise] = useState<
    null | "RevisionRequested" | "ProofRevisionRequested"
  >(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setD(
        unwrap(
          await apiClient.get(
            API_ENDPOINTS.GET_DECLARATION_FOR_REVIEW(userId, fy),
          ),
        ),
      );
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [userId, fy, setAlert]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (
    decision:
      | "Declared"
      | "RevisionRequested"
      | "Verified"
      | "ProofRevisionRequested",
  ) => {
    const proofs =
      decision === "Verified" || decision === "ProofRevisionRequested";
    setBusy(true);
    try {
      await apiClient.post(
        proofs
          ? API_ENDPOINTS.REVIEW_DECLARATION_PROOFS
          : API_ENDPOINTS.REVIEW_DECLARATION,
        {
          userId,
          financialYear: fy,
          decision,
          revisionNotes: decision.endsWith("RevisionRequested")
            ? { general: note }
            : undefined,
        },
      );
      setAlert({
        open: true,
        message: decision.endsWith("RevisionRequested")
          ? "Revision requested."
          : "Approved.",
        severity: "success",
      });
      setRevise(null);
      setNote("");
      load();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const st = d?.status;
  const byCode = Object.fromEntries(
    (d?.lineItems ?? []).map((i) => [i.code, i]),
  );
  // Same caps as the employee page and the gateway's tdsCalc.ts.
  const reviewDeclared = LINE_ITEMS.reduce(
    (a, x) => a + (byCode[x.code]?.declaredAmount ?? 0),
    0,
  );
  const reviewCapped = LINE_ITEMS.reduce(
    (a, x) =>
      a + Math.min(byCode[x.code]?.declaredAmount ?? 0, x.cap ?? Infinity),
    0,
  );
  return (
    <Page
      title={d?.employee ? personName(d.employee) : "Tax Declaration"}
      subtitle={`FY ${fy}`}
      back={{ to: "/payroll/tax-declarations", label: "Tax Declarations" }}
      width="wide"
      actions={
        st === "Submitted" ? (
          <>
            <Button
              variant="tintedDanger"
              icon="refresh"
              onClick={() => setRevise("RevisionRequested")}
            >
              Request Revision
            </Button>
            <Button
              variant="primary"
              icon="checkCircle"
              busy={busy}
              onClick={() => decide("Declared")}
            >
              Approve Declaration
            </Button>
          </>
        ) : st === "ProofsSubmitted" ? (
          <>
            <Button
              variant="tintedDanger"
              icon="refresh"
              onClick={() => setRevise("ProofRevisionRequested")}
            >
              Request Proof Revision
            </Button>
            <Button
              variant="primary"
              icon="checkCircle"
              busy={busy}
              onClick={() => decide("Verified")}
            >
              Verify Proofs
            </Button>
          </>
        ) : null
      }
    >
      {loading ? (
        <div style={{ display: "grid", gap: 24 }}>
          <Skeleton width={120} height={22} radius={11} />
          <KeyValuesSkeleton rows={6} />
        </div>
      ) : !d ? (
        <EmptyState icon="doc" title={`No declaration for FY ${fy}`}>
          This employee hasn’t started an Old Regime declaration for this year,
          so they’re on the New Regime.
        </EmptyState>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          <Card>
            <div className={s.reviewHead}>
              <Avatar
                name={d.employee ? personName(d.employee) : "?"}
                size={48}
              />
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <span className="px-title">
                  {d.employee ? personName(d.employee) : "Employee"}
                </span>
                <span className="px-meta">
                  Old Regime declaration · FY {fy}
                  {d.updatedAt
                    ? ` · updated ${dayjs(d.updatedAt).format("D MMM YYYY")}`
                    : ""}
                </span>
              </div>
              <StatusPill s={st} />
            </div>
            <div style={{ marginTop: 16 }}>
              <TaxProgress status={st ?? null} />
            </div>
          </Card>
          {(st === "RevisionRequested" || st === "ProofRevisionRequested") &&
            Object.keys(d.revisionNotes ?? {}).length > 0 && (
              <Banner tone="warning" title="Changes requested">
                {Object.values(d.revisionNotes ?? {}).join("; ")}
              </Banner>
            )}
          <StatTiles label="Declaration summary" min={170}>
            <StatTile
              label="Monthly Rent"
              icon="wfh"
              value={d.monthlyRent ? fmtMoney(d.monthlyRent) : "None"}
              note={
                d.monthlyRent
                  ? `${fmtMoney(d.monthlyRent * 12)} a year, for HRA`
                  : "No HRA exemption claimed"
              }
            />
            <StatTile
              label="Metro City"
              icon="pin"
              value={d.isMetroCity ? "Yes" : "No"}
              note="Affects the HRA exemption rate"
            />
            <StatTile
              label="Declared"
              icon="doc"
              tone="accent"
              value={fmtMoney(reviewDeclared)}
              note="Across all sections"
            />
            <StatTile
              label="Deductible"
              icon="checkCircle"
              tone="success"
              value={fmtMoney(reviewCapped)}
              note="After section limits"
            />
          </StatTiles>
          <Card padded={false}>
            <table className={s.reviewTable}>
              <caption className="px-sr-only">Deductions</caption>
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Limit</th>
                  <th scope="col" className={s.num}>
                    Declared
                  </th>
                  <th scope="col" className={s.num}>
                    Proof
                  </th>
                </tr>
              </thead>
              <tbody>
                {LINE_ITEMS.map((def) => {
                  const item = byCode[def.code];
                  const declared = item?.declaredAmount ?? 0;
                  const over = def.cap != null && declared > def.cap;
                  return (
                    <tr key={def.code} data-empty={!declared || undefined}>
                      <th scope="row">
                        <span className={s.lineLabel}>{def.label}</span>
                        <span className="px-meta">{def.hint}</span>
                      </th>
                      <td>
                        {def.cap != null ? (
                          <div className={s.cap} data-over={over || undefined}>
                            <span className={s.capMeter} aria-hidden>
                              <span
                                style={{
                                  width: `${Math.min(1, declared / def.cap) * 100}%`,
                                }}
                              />
                            </span>
                            <span className="px-meta px-num">
                              {fmtMoney(def.cap)}
                            </span>
                          </div>
                        ) : (
                          <span className="px-meta">No limit</span>
                        )}
                      </td>
                      <td className={s.num}>
                        <span className={s.amountCell}>
                          {declared ? fmtMoney(declared) : "—"}
                        </span>
                        {over && (
                          <span
                            className="px-meta"
                            style={{
                              display: "block",
                              color: "var(--px-warning)",
                            }}
                          >
                            Over limit
                          </span>
                        )}
                      </td>
                      <td className={s.num}>
                        {item?.proofAmount != null ? (
                          <span className={s.amountCell}>
                            {fmtMoney(item.proofAmount)}
                          </span>
                        ) : declared ? (
                          <Tag>Not submitted</Tag>
                        ) : (
                          <span className="px-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}
      <Dialog
        open={Boolean(revise)}
        onClose={() => setRevise(null)}
        busy={busy}
        size="sm"
        title={
          revise === "ProofRevisionRequested"
            ? "Request Proof Revision"
            : "Request Revision"
        }
        footer={
          <>
            <Button onClick={() => setRevise(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={!note.trim()}
              busy={busy}
              onClick={() => revise && decide(revise)}
            >
              Send Request
            </Button>
          </>
        }
      >
        <Field
          label="What needs to change?"
          hint="The employee sees this note."
        >
          <TextArea
            data-autofocus
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </Dialog>
    </Page>
  );
}
