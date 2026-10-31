import dayjs from "dayjs";
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";
import { Collapse, TransitionLink } from "@next/motion";
import {
  Avatar,
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  FormGrid,
  Inspector,
  KeyValues,
  Page,
  Pagination,
  PrimaryCell,
  Section,
  SegmentedControl,
  Skeleton,
  Status,
  Switch,
  TextArea,
  TextInput,
  fieldSpan2,
  inlineCheckClass,
  type Column,
  ChecklistSkeleton,
} from "@next/ui";
import { apiClient, asList, errorMessage, unwrap } from "@next/lib/api";
import { usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fmtMoney, personName } from "@next/lib/format";

// Resignations (Classic's ViewResignations, ResignationDecisionDialog,
// ExitManagementDialog). Same endpoints and rules:
//  • approve/reject: owners/admins or ResignationProcess approve/reject at
//    team/all scope, not on one's own (superusers excepted), only while open;
//  • withdraw: the resigning person (or a superuser) while Submitted;
//  • exit management: owners/admins or update_resignation_status, not for
//    withdrawn/rejected resignations.

const STATUSES = ["All", "Submitted", "Approved", "Rejected", "Withdrawn"];

export default function Resignations() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const p = (action: string, scope: string) =>
    hasPermission(
      "ResignationProcess",
      action,
      scope,
      user?.isSuperUser,
      user?.permissions || [],
    );
  const canDecide =
    isOwnerOrAdmin(user) ||
    ["team", "all"].some(
      (sc) => p("approve_resignation", sc) || p("reject_resignation", sc),
    );
  const canManageExit =
    isOwnerOrAdmin(user) ||
    p("update_resignation_status", "team") ||
    p("update_resignation_status", "all");
  const [status, setStatus] = useState("All");
  const [mine, setMine] = useState<any | null>(null);
  const [resigning, setResigning] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<{
    mode: "approve" | "reject";
    ids: string[];
    name?: string;
  } | null>(null);
  const [withdraw, setWithdraw] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const list = usePagedList(
    (pg, l) =>
      `${API_ENDPOINTS.VIEW_RESIGNATIONS(pg, l)}${status !== "All" ? `&status=${encodeURIComponent(status)}` : ""}`,
    {
      deps: [status],
      listKeys: ["resignations"],
    },
  );
  useEffect(() => setChecked(new Set()), [list.data]);

  const loadMine = () =>
    apiClient
      .get(API_ENDPOINTS.GET_MY_RESIGNATION)
      .then((res) => setMine(unwrap(res)))
      .catch(() => setMine(null));
  useEffect(() => {
    loadMine();
  }, []);

  const canDecideRow = (r: any) =>
    canDecide &&
    !["Withdrawn", "Rejected", "Approved"].includes(r.status) &&
    (user?.isSuperUser || r.userId !== user?.id);
  const canWithdrawRow = (r: any) =>
    r.status === "Submitted" && (r.userId === user?.id || user?.isSuperUser);
  const decidable = list.data.filter(canDecideRow);
  const refresh = () => {
    list.refresh();
    loadMine();
  };

  const doWithdraw = async () => {
    setBusy(true);
    try {
      const res = await apiClient.put(
        API_ENDPOINTS.WITHDRAW_RESIGNATION(withdraw.id),
      );
      setAlert({
        open: true,
        message: res.data?.message || "Resignation withdrawn.",
        severity: "success",
      });
      setWithdraw(null);
      setSelected(null);
      refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "who",
      header: "Employee",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          leading={<Avatar name={personName(r)} size={28} />}
          title={personName(r)}
          subtitle={r.username}
        />
      ),
    },
    {
      key: "date",
      header: "Resigned",
      priority: "secondary",
      stackLabel: "Resigned",
      render: (r) => (
        <span className="px-num">
          {fmtDate(r.resignationDate || r.createdAt)}
        </span>
      ),
    },
    {
      key: "lwd",
      header: "Last Day",
      priority: "secondary",
      stackLabel: "Last day",
      render: (r) => (
        <span className="px-num">{fmtDate(r.lastWorkingDate)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => <Status value={r.status} />,
    },
  ];
  const active = mine && ["Submitted", "Approved"].includes(mine.status);

  return (
    <Page
      title="Resignations"
      actions={
        !active && (
          <Button
            data-tour="resign-submit"
            variant="tintedDanger"
            icon="door"
            onClick={() => setResigning(true)}
          >
            Submit Resignation…
          </Button>
        )
      }
      tabs={
        <SegmentedControl
          role="radiogroup"
          label="Status"
          value={status}
          onChange={setStatus}
          segments={STATUSES.map((s) => ({ value: s, label: s }))}
        />
      }
      inspector={
        <Inspector
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title="Resignation"
          id={selected?.id}
        >
          {selected && (
            <ResignationDetail
              r={selected}
              canDecide={canDecideRow(selected)}
              canWithdraw={canWithdrawRow(selected)}
              canManageExit={
                canManageExit &&
                !["Withdrawn", "Rejected"].includes(selected.status)
              }
              onDecide={(mode) =>
                setDecision({
                  mode,
                  ids: [selected.id],
                  name: personName(selected),
                })
              }
              onWithdraw={() => setWithdraw(selected)}
              onChanged={refresh}
            />
          )}
        </Inspector>
      }
    >
      <div style={{ display: "grid", gap: 20 }}>
        {active && (
          <Banner tone="warning" icon="door">
            Your resignation is <b>{mine.status.toLowerCase()}</b>
            {mine.lastWorkingDate
              ? `, with your last working day on ${fmtDate(mine.lastWorkingDate)}`
              : ""}
            .{" "}
            {mine.status === "Approved" ? (
              <TransitionLink to="/resignation-process/exit-feedback">
                Fill in your exit feedback
              </TransitionLink>
            ) : (
              <button
                type="button"
                className="px-link-button"
                onClick={() => setWithdraw(mine)}
              >
                Withdraw resignation
              </button>
            )}
          </Banner>
        )}
        <DataTable
          label="Resignations"
          tour="resign-table"
          columns={columns}
          rows={list.data}
          rowId={(r) => String(r.id)}
          loading={list.loading}
          onRowClick={setSelected}
          selectedId={selected?.id ?? null}
          selected={decidable.length > 1 ? checked : undefined}
          onSelectedChange={(next) =>
            setChecked(
              new Set(
                [...next].filter((id) =>
                  decidable.some((d) => String(d.id) === id),
                ),
              ),
            )
          }
          bulkActions={
            <>
              <Button
                size="small"
                variant="tintedDanger"
                onClick={() =>
                  setDecision({ mode: "reject", ids: [...checked] })
                }
              >
                Reject
              </Button>
              <Button
                size="small"
                variant="primary"
                onClick={() =>
                  setDecision({ mode: "approve", ids: [...checked] })
                }
              >
                Approve
              </Button>
            </>
          }
          stickyOffset={52}
          empty={{ icon: "door", title: "No resignations" }}
          footer={<Pagination {...list.pageProps} />}
        />
      </div>
      <DecisionDialog
        value={decision}
        onClose={() => setDecision(null)}
        onDone={() => {
          setDecision(null);
          setSelected(null);
          refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(withdraw)}
        onClose={() => setWithdraw(null)}
        onConfirm={doWithdraw}
        busy={busy}
        tone="accent"
        title="Withdraw Resignation?"
        description="You’ll stay on as before. Your manager and HR are notified."
        confirmLabel="Withdraw"
      />
      <Dialog
        open={resigning}
        onClose={() => setResigning(false)}
        title="Submit Your Resignation?"
        description="Your manager and HR are notified. You can withdraw it while it’s pending."
        icon={{ name: "door", tone: "danger" }}
      >
        <ResignForm
          onCancel={() => setResigning(false)}
          onDone={() => {
            setResigning(false);
            refresh();
            setAlert({
              open: true,
              message: "Resignation submitted.",
              severity: "success",
            });
          }}
        />
      </Dialog>
    </Page>
  );
}

function ResignationDetail({
  r,
  canDecide,
  canWithdraw,
  canManageExit,
  onDecide,
  onWithdraw,
  onChanged,
}: {
  r: any;
  canDecide: boolean;
  canWithdraw: boolean;
  canManageExit: boolean;
  onDecide: (m: "approve" | "reject") => void;
  onWithdraw: () => void;
  onChanged: () => void;
}) {
  const feedback: [string, unknown][] = [
    ["Overall Satisfaction", r.overallJobSatisfaction],
    ["Communication", r.qualityOfCommunication],
    ["Manager Support", r.supportFromManager],
    ["Appreciation", r.appreciationForWork],
    ["Team Collaboration", r.collaborationWithinTheTeam],
    ["Culture", r.overallCompanyCulture],
    ["Suggestions", r.suggestions],
  ];
  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div className="px-row" style={{ gap: 12 }}>
        <Avatar name={personName(r)} size={44} />
        <div style={{ display: "grid", gap: 2 }}>
          <span className="px-section">{personName(r)}</span>
          <span>
            <Status value={r.status} />
          </span>
        </div>
      </div>
      <KeyValues
        items={[
          ["Resigned", fmtDate(r.resignationDate || r.createdAt)],
          ["Last Working Day", fmtDate(r.lastWorkingDate)],
          [
            "Relieved From Duty",
            r.relievedFromDutyOn ? fmtDate(r.relievedFromDutyOn) : null,
          ],
          ["Reason", r.reason],
          [
            "Rehire Eligible",
            r.rehireEligible == null ? null : r.rehireEligible ? "Yes" : "No",
          ],
        ]}
      />
      {(canDecide || canWithdraw) && (
        <div className="px-row" style={{ justifyContent: "flex-end" }}>
          {canWithdraw && (
            <Button variant="plain" onClick={onWithdraw}>
              Withdraw
            </Button>
          )}
          {canDecide && (
            <>
              <Button variant="tintedDanger" onClick={() => onDecide("reject")}>
                Reject
              </Button>
              <Button variant="primary" onClick={() => onDecide("approve")}>
                Approve
              </Button>
            </>
          )}
        </div>
      )}
      {canManageExit && <ExitManagement r={r} onChanged={onChanged} />}
      {feedback.some(([, v]) => v != null && v !== "") && (
        <Section title="Exit Feedback" headingLevel={3}>
          <KeyValues
            items={feedback
              .filter(([, v]) => v != null && v !== "")
              .map(([k, v]) => [k, String(v)])}
          />
        </Section>
      )}
    </div>
  );
}

// Checklist, notice renegotiation, F&F settlement, and rehire eligibility.
function ExitManagement({ r, onChanged }: { r: any; onChanged: () => void }) {
  const { setAlert } = useContext(AlertContext);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [settlement, setSettlement] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [renegotiate, setRenegotiate] = useState(false);
  const [newDay, setNewDay] = useState("");
  const [reason, setReason] = useState("");
  const [confirmFnf, setConfirmFnf] = useState(false);
  const [rehire, setRehire] = useState<boolean | null>(
    r.rehireEligible ?? null,
  );

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      apiClient.get(API_ENDPOINTS.GET_RESIGNATION_CHECKLIST(r.id)),
      apiClient.get(API_ENDPOINTS.RESIGNATION_NOTICE_EVENTS(r.id)),
      apiClient.get(API_ENDPOINTS.COMPUTE_FNF_SETTLEMENT(r.id)),
    ]).then(([c, e, f]) => {
      setChecklist(c.status === "fulfilled" ? asList(c.value.data?.data) : []);
      setEvents(e.status === "fulfilled" ? asList(e.value.data?.data) : []);
      setSettlement(
        f.status === "fulfilled" ? (f.value.data?.data ?? null) : null,
      );
      setLoading(false);
    });
  }, [r.id]);

  const run = async (
    key: string,
    fn: () => Promise<any>,
    ok: string,
    after?: (res: any) => void,
  ) => {
    setBusy(key);
    try {
      const res = await fn();
      after?.(res);
      setAlert({ open: true, message: ok, severity: "success" });
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(null);
    }
  };

  const done = checklist.filter((c) => c.isComplete).length;
  if (loading)
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Skeleton width={140} height={17} />
        <ChecklistSkeleton items={4} />
      </div>
    );
  return (
    <>
      <Section
        title="Exit Checklist"
        detail={checklist.length ? `${done} of ${checklist.length}` : undefined}
        headingLevel={3}
      >
        {checklist.length === 0 ? (
          <p className="px-tertiary px-callout">
            No checklist items configured.
          </p>
        ) : (
          <ul style={{ display: "grid", gap: 6 }}>
            {checklist.map((c) => (
              <li key={c.itemDefId}>
                <label className={inlineCheckClass}>
                  <Checkbox
                    checked={c.isComplete}
                    disabled={busy === c.itemDefId}
                    onChange={() =>
                      run(
                        c.itemDefId,
                        () =>
                          apiClient.put(
                            API_ENDPOINTS.UPDATE_RESIGNATION_CHECKLIST_ITEM(
                              r.id,
                              c.itemDefId,
                            ),
                            { isComplete: !c.isComplete },
                          ),
                        c.isComplete ? "Marked not done." : "Marked done.",
                        () =>
                          setChecklist((prev) =>
                            prev.map((x) =>
                              x.itemDefId === c.itemDefId
                                ? { ...x, isComplete: !x.isComplete }
                                : x,
                            ),
                          ),
                      )
                    }
                  />
                  <span>
                    {c.label}
                    <span className="px-meta">
                      {" "}
                      · {c.owningRole}
                      {c.isRequired ? "" : " · optional"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Notice Period"
        headingLevel={3}
        action={
          r.status === "Approved" && (
            <Button
              size="small"
              variant="plain"
              onClick={() => setRenegotiate((v) => !v)}
            >
              Change Last Day
            </Button>
          )
        }
      >
        <Collapse open={renegotiate}>
          <div style={{ display: "grid", gap: 10, paddingBottom: 8 }}>
            <Field label="New Last Working Day">
              <TextInput
                type="date"
                value={newDay}
                onChange={(e) => setNewDay(e.target.value)}
              />
            </Field>
            <Field label="Reason" optional>
              <TextInput
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div>
              <Button
                size="small"
                variant="primary"
                disabled={!newDay}
                busy={busy === "notice"}
                onClick={() =>
                  run(
                    "notice",
                    () =>
                      apiClient.put(API_ENDPOINTS.RENEGOTIATE_NOTICE(r.id), {
                        newLastWorkingDay: newDay,
                        reason: reason || undefined,
                      }),
                    "Last working day updated.",
                    () => {
                      setRenegotiate(false);
                      setEvents((e) => [
                        {
                          id: String(Date.now()),
                          previousLastWorkingDay: r.lastWorkingDate,
                          newLastWorkingDay: newDay,
                          reason,
                          createdAt: new Date().toISOString(),
                        },
                        ...e,
                      ]);
                      onChanged();
                    },
                  )
                }
              >
                Save
              </Button>
            </div>
          </div>
        </Collapse>
        {events.length === 0 ? (
          <p className="px-tertiary px-callout">
            No changes to the notice period.
          </p>
        ) : (
          <ul style={{ display: "grid", gap: 8 }}>
            {events.map((e) => (
              <li key={e.id} className="px-callout">
                {e.previousLastWorkingDay
                  ? `${fmtDate(e.previousLastWorkingDay)} → `
                  : ""}
                <b>{fmtDate(e.newLastWorkingDay)}</b>
                <span className="px-meta">
                  {" "}
                  · {dayjs(e.createdAt).format("D MMM")}
                  {e.reason ? ` · ${e.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Full & Final Settlement"
        headingLevel={3}
        action={
          settlement?.status !== "approved" && (
            <Button
              size="small"
              variant="plain"
              busy={busy === "fnf"}
              onClick={() =>
                run(
                  "fnf",
                  () =>
                    apiClient.post(API_ENDPOINTS.COMPUTE_FNF_SETTLEMENT(r.id)),
                  "Settlement computed.",
                  (res) => setSettlement(res.data?.data ?? null),
                )
              }
            >
              {settlement ? "Recompute" : "Compute"}
            </Button>
          )
        }
      >
        {!settlement ? (
          <p className="px-tertiary px-callout">Not computed yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <KeyValues
              items={[
                ...(settlement.lineItems ?? []).map(
                  (l: any) =>
                    [
                      `${l.label}${l.type === "deduction" ? " (deduction)" : ""}`,
                      fmtMoney(l.amount),
                    ] as [string, string],
                ),
                [
                  "Net Payable",
                  <b className="px-num">{fmtMoney(settlement.netPayable)}</b>,
                ],
                [
                  "Status",
                  <Status
                    value={
                      settlement.status
                        ? settlement.status[0].toUpperCase() +
                          settlement.status.slice(1)
                        : null
                    }
                  />,
                ],
              ]}
            />
            {settlement.status !== "approved" && (
              <div>
                <Button
                  size="small"
                  variant="primary"
                  onClick={() => setConfirmFnf(true)}
                >
                  Approve Settlement
                </Button>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Rehire" headingLevel={3}>
        <label className={inlineCheckClass}>
          <Switch
            checked={Boolean(rehire)}
            disabled={busy === "rehire"}
            label="Eligible for rehire"
            onChange={(v) =>
              run(
                "rehire",
                () =>
                  apiClient.put(API_ENDPOINTS.SET_REHIRE_ELIGIBILITY(r.id), {
                    rehireEligible: v,
                  }),
                v ? "Marked eligible for rehire." : "Marked not eligible.",
                () => setRehire(v),
              )
            }
          />
          Eligible for rehire
        </label>
      </Section>

      <ConfirmDialog
        open={confirmFnf}
        onClose={() => setConfirmFnf(false)}
        busy={busy === "fnf-approve"}
        tone="accent"
        title="Approve Settlement?"
        description={
          settlement
            ? `Net payable ${fmtMoney(settlement.netPayable)}. It can’t be recomputed after approval.`
            : undefined
        }
        confirmLabel="Approve"
        onConfirm={() =>
          run(
            "fnf-approve",
            () => apiClient.put(API_ENDPOINTS.APPROVE_FNF_SETTLEMENT(r.id)),
            "Settlement approved.",
            (res) => {
              setSettlement(res.data?.data ?? null);
              setConfirmFnf(false);
            },
          )
        }
      />
    </>
  );
}

function DecisionDialog({
  value,
  onClose,
  onDone,
}: {
  value: { mode: "approve" | "reject"; ids: string[]; name?: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [f, setF] = useState({
    comments: "",
    rejectionReason: "",
    lastWorkingDay: "",
    waived: false,
    buyout: "",
    garden: false,
    relievedOn: "",
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (value)
      setF({
        comments: "",
        rejectionReason: "",
        lastWorkingDay: "",
        waived: false,
        buyout: "",
        garden: false,
        relievedOn: "",
      });
  }, [value]);
  const bulk = (value?.ids.length ?? 0) > 1;
  const approving = value?.mode === "approve";
  const title = useMemo(
    () =>
      bulk
        ? `${approving ? "Approve" : "Reject"} ${value?.ids.length} Resignations`
        : `${approving ? "Approve" : "Reject"} Resignation`,
    [bulk, approving, value],
  );
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!value) return;
    setSaving(true);
    try {
      if (bulk) {
        const res = await apiClient.put(
          approving
            ? API_ENDPOINTS.BULK_APPROVE_RESIGNATIONS
            : API_ENDPOINTS.BULK_REJECT_RESIGNATIONS,
          {
            ids: value.ids,
            comments: f.comments || undefined,
            ...(approving
              ? {}
              : { rejectionReason: f.rejectionReason || undefined }),
          },
        );
        const failed = res.data?.data?.failed ?? [];
        setAlert({
          open: true,
          message: failed.length
            ? `${value.ids.length - failed.length} done, ${failed.length} failed.`
            : `${value.ids.length} resignations ${approving ? "approved" : "rejected"}.`,
          severity: failed.length ? "warning" : "success",
        });
      } else if (approving) {
        await apiClient.put(API_ENDPOINTS.APPROVE_RESIGNATION(value.ids[0]), {
          comments: f.comments || undefined,
          lastWorkingDay: f.lastWorkingDay || undefined,
          noticePeriodWaived: f.waived,
          buyoutAmount: f.waived && f.buyout ? Number(f.buyout) : undefined,
          relievedFromDutyOn:
            f.garden && f.relievedOn ? f.relievedOn : undefined,
        });
        setAlert({
          open: true,
          message: "Resignation approved.",
          severity: "success",
        });
      } else {
        await apiClient.put(API_ENDPOINTS.REJECT_RESIGNATION(value.ids[0]), {
          rejectionReason: f.rejectionReason || undefined,
          comments: f.comments || undefined,
        });
        setAlert({
          open: true,
          message: "Resignation rejected.",
          severity: "success",
        });
      }
      onDone();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={Boolean(value)}
      onClose={onClose}
      busy={saving}
      title={title}
      description={value?.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={approving ? "primary" : "danger"}
            busy={saving}
            onClick={() => submit()}
          >
            {approving ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          {approving && !bulk && (
            <>
              <Field
                label="Last Working Day"
                optional
                hint="Defaults to the notice period."
                className={fieldSpan2}
              >
                <TextInput
                  type="date"
                  min={dayjs().format("YYYY-MM-DD")}
                  value={f.lastWorkingDay}
                  onChange={(e) =>
                    setF((x) => ({ ...x, lastWorkingDay: e.target.value }))
                  }
                />
              </Field>
              <label className={`${inlineCheckClass} ${fieldSpan2}`}>
                <Switch
                  checked={f.waived}
                  onChange={(v) => setF((x) => ({ ...x, waived: v }))}
                  label="Waive notice period"
                />
                Waive notice period
              </label>
              <div className={fieldSpan2}>
                <Collapse open={f.waived}>
                  <Field label="Buyout Amount (₹)" optional>
                    <TextInput
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={f.buyout}
                      onChange={(e) =>
                        setF((x) => ({ ...x, buyout: e.target.value }))
                      }
                    />
                  </Field>
                </Collapse>
              </div>
              <label className={`${inlineCheckClass} ${fieldSpan2}`}>
                <Switch
                  checked={f.garden}
                  onChange={(v) => setF((x) => ({ ...x, garden: v }))}
                  label="Garden leave"
                />
                Garden leave (relieve from duty before the last day)
              </label>
              <div className={fieldSpan2}>
                <Collapse open={f.garden}>
                  <Field label="Relieved From Duty On">
                    <TextInput
                      type="date"
                      value={f.relievedOn}
                      onChange={(e) =>
                        setF((x) => ({ ...x, relievedOn: e.target.value }))
                      }
                    />
                  </Field>
                </Collapse>
              </div>
            </>
          )}
          {!approving && (
            <Field label="Reason" optional className={fieldSpan2}>
              <TextInput
                data-autofocus
                value={f.rejectionReason}
                onChange={(e) =>
                  setF((x) => ({ ...x, rejectionReason: e.target.value }))
                }
              />
            </Field>
          )}
          <Field label="Comments" optional className={fieldSpan2}>
            <TextArea
              rows={3}
              value={f.comments}
              onChange={(e) =>
                setF((x) => ({ ...x, comments: e.target.value }))
              }
            />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}

function ResignForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5)
      return setError("Tell us a little about why (at least 5 characters).");
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.ADD_RESIGNATION, {
        reason: reason.trim(),
      });
      onDone();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate style={{ display: "grid", gap: 16 }}>
      <Field label="Reason" error={error}>
        <TextArea
          data-autofocus
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="px-row" style={{ justifyContent: "flex-end" }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="danger" busy={saving}>
          Submit Resignation
        </Button>
      </div>
    </form>
  );
}
