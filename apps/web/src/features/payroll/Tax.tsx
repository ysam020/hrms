import dayjs from "dayjs";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate } from "@next/motion";
import {
  Avatar,
  Banner,
  Button,
  DataTable,
  Dialog,
  Field,
  KeyValues,
  Page,
  Pagination,
  PrimaryCell,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  Switch,
  TextArea,
  TextInput,
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

  return (
    <Page
      title="My Tax Declaration"
      subtitle={`Financial year ${fy}`}
      width="reading"
      actions={
        status !== null &&
        editable && (
          <>
            <Button
              onClick={() => call("draft", saveDraft, "Draft saved.")}
              busy={saving === "draft"}
            >
              Save Draft
            </Button>
            <Button
              variant="primary"
              busy={saving === "submit"}
              onClick={() =>
                call(
                  "submit",
                  async () => {
                    await saveDraft();
                    await apiClient.post(API_ENDPOINTS.SUBMIT_DECLARATION, {
                      financialYear: fy,
                    });
                  },
                  "Declaration submitted for review.",
                )
              }
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
      ) : (
        <div style={{ display: "grid", gap: 28 }}>
          <div className="px-row">
            <StatusPill s={status} />
          </div>
          {status === null ? (
            <div style={{ display: "grid", gap: 14, justifyItems: "start" }}>
              <p className="px-secondary" style={{ maxWidth: "62ch" }}>
                You’re on the <b>New Regime</b> for FY {fy}, which needs no
                declarations. The <b>Old Regime</b> lets you declare 80C, 80D,
                HRA, and home-loan exemptions, which can lower your monthly TDS
                if you have them.
              </p>
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
          ) : (
            <>
              {(status === "RevisionRequested" ||
                status === "ProofRevisionRequested") && (
                <Banner tone="danger">
                  HR asked for changes:{" "}
                  {notes.join("; ") || "review the amounts below and resubmit."}
                </Banner>
              )}
              {status === "Declared" && (
                <Banner tone="accent">
                  Your declaration was approved. Enter the amounts your proofs
                  cover and submit them.
                </Banner>
              )}
              {status === "Verified" && (
                <Banner tone="success">
                  Your proofs are verified for FY {fy}.
                </Banner>
              )}
              <section>
                <h2 className="px-section">House Rent</h2>
                <div className={s.list}>
                  <div className={s.row}>
                    <span>Monthly rent</span>
                    {editable ? (
                      <TextInput
                        aria-label="Monthly rent"
                        className={s.amount}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={rent}
                        onChange={(e) => setRent(Number(e.target.value) || 0)}
                      />
                    ) : (
                      <span className="px-num">{fmtMoney(rent)}</span>
                    )}
                  </div>
                  <label className={`${s.row} ${inlineCheckClass}`}>
                    <span>I live in a metro city</span>
                    <Switch
                      checked={metro}
                      onChange={setMetro}
                      label="Metro city"
                      disabled={!editable}
                    />
                  </label>
                </div>
              </section>
              <section>
                <h2 className="px-section">Deductions</h2>
                <ul className={s.list}>
                  {LINE_ITEMS.map((d) => (
                    <li key={d.code} className={s.row}>
                      <span style={{ display: "grid" }}>
                        <span>{d.label}</span>
                        <span className="px-meta">
                          {d.hint}
                          {d.cap ? ` · up to ${fmtMoney(d.cap)}` : ""}
                        </span>
                      </span>
                      <span className="px-row" style={{ flexWrap: "nowrap" }}>
                        {editable ? (
                          <TextInput
                            aria-label={`${d.label} amount`}
                            className={s.amount}
                            type="number"
                            min={0}
                            max={d.cap ?? undefined}
                            inputMode="numeric"
                            value={amounts[d.code] ?? 0}
                            onChange={(e) =>
                              setAmounts((a) => ({
                                ...a,
                                [d.code]: Number(e.target.value) || 0,
                              }))
                            }
                          />
                        ) : (
                          <span className="px-num">
                            {fmtMoney(amounts[d.code] ?? 0)}
                          </span>
                        )}
                        {proofsDue && (
                          <TextInput
                            aria-label={`${d.label} proof amount`}
                            className={s.amount}
                            type="number"
                            min={0}
                            inputMode="numeric"
                            placeholder="Proof"
                            value={proofs[d.code] ?? 0}
                            onChange={(e) =>
                              setProofs((p) => ({
                                ...p,
                                [d.code]: Number(e.target.value) || 0,
                              }))
                            }
                          />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="px-meta" style={{ marginTop: 8 }}>
                  Deductible total (after caps):{" "}
                  <b className="px-num">{fmtMoney(total)}</b>
                </p>
              </section>
              {proofsDue && (
                <div>
                  <Button
                    variant="primary"
                    busy={saving === "proofs"}
                    onClick={() =>
                      call(
                        "proofs",
                        () =>
                          apiClient.post(
                            API_ENDPOINTS.SUBMIT_DECLARATION_PROOFS,
                            { financialYear: fy, proofs },
                          ),
                        "Proofs submitted for verification.",
                      )
                    }
                  >
                    Submit Proofs
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Page>
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
  return (
    <Page
      title={d?.employee ? personName(d.employee) : "Tax Declaration"}
      subtitle={`FY ${fy}`}
      back={{ to: "/payroll/tax-declarations", label: "Tax Declarations" }}
      width="reading"
      actions={
        st === "Submitted" ? (
          <>
            <Button
              variant="tintedDanger"
              onClick={() => setRevise("RevisionRequested")}
            >
              Request Revision
            </Button>
            <Button
              variant="primary"
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
              onClick={() => setRevise("ProofRevisionRequested")}
            >
              Request Proof Revision
            </Button>
            <Button
              variant="primary"
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
        <p className="px-secondary">No declaration for this year.</p>
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          <div>
            <StatusPill s={st} />
          </div>
          <KeyValues
            items={[
              ["Monthly Rent", fmtMoney(d.monthlyRent)],
              ["Metro City", d.isMetroCity ? "Yes" : "No"],
              [
                "Last Updated",
                d.updatedAt ? dayjs(d.updatedAt).format("D MMM YYYY") : null,
              ],
            ]}
          />
          <section>
            <h2 className="px-section">Deductions</h2>
            <ul className={s.list}>
              <li className={s.row} aria-hidden>
                <span className="px-meta">Section</span>
                <span className="px-meta">Declared · Proof</span>
              </li>
              {LINE_ITEMS.map((def) => (
                <li key={def.code} className={s.row}>
                  <span>{def.label}</span>
                  <span className="px-num">
                    {fmtMoney(byCode[def.code]?.declaredAmount ?? 0)}
                    <span className="px-tertiary">
                      {" "}
                      ·{" "}
                      {byCode[def.code]?.proofAmount != null
                        ? fmtMoney(byCode[def.code].proofAmount)
                        : "—"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
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
