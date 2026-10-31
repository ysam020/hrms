import { useContext, useEffect, useState, type FormEvent } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Button,
  DataTable,
  Dialog,
  Field,
  FormGrid,
  Inspector,
  KeyValues,
  Page,
  Pagination,
  PrimaryCell,
  SegmentedControl,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  fieldSpan2,
  type Column,
  type Tone,
} from "@next/ui";
import { priorityTone } from "@next/features/helpdesk/shared";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fromNow, personName } from "@next/lib/format";
import { useCanManageAssets } from "./Assets";

// Asset issues (Classic's AssetIssues): report an issue against an asset,
// and — for asset managers — move it through Classic's transitions
// (open → in review → approved/rejected → resolved) with notes.

const STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "accent" },
  in_review: { label: "In Review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  resolved: { label: "Resolved", tone: "success" },
};
const TYPES = [
  ["malfunction", "Malfunction"],
  ["damage", "Damage"],
  ["lost", "Lost"],
  ["stolen", "Stolen"],
  ["return_request", "Return Request"],
  ["other", "Other"],
];
const PRIORITIES = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["critical", "Critical"],
];
const NEXT: Record<string, { status: string; label: string }[]> = {
  open: [{ status: "in_review", label: "Start Review" }],
  in_review: [
    { status: "rejected", label: "Reject" },
    { status: "approved", label: "Approve" },
  ],
  approved: [{ status: "resolved", label: "Resolve" }],
};
const typeLabel = (t: string) => TYPES.find(([v]) => v === t)?.[1] ?? t;

export default function Issues() {
  const { setAlert } = useContext(AlertContext);
  const manager = useCanManageAssets();
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<any | null>(null);
  const [reporting, setReporting] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const list = usePagedList(
    (p, l) =>
      API_ENDPOINTS.ASSET_ISSUES(
        p,
        l,
        status !== "All" ? `&status=${status}` : "",
      ),
    {
      deps: [status],
      listKeys: ["issues"],
    },
  );

  const act = async () => {
    if (!selected || !target) return;
    setBusy(true);
    try {
      await apiClient.patch(
        API_ENDPOINTS.UPDATE_ASSET_ISSUE_STATUS(selected.id),
        { status: target, notes: notes || undefined },
      );
      setAlert({
        open: true,
        message: `Marked ${STATUS[target]?.label.toLowerCase()}.`,
        severity: "success",
      });
      setTarget(null);
      setNotes("");
      setSelected(null);
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "title",
      header: "Issue",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          title={r.title}
          subtitle={`${r.asset?.assetCode ?? ""} ${r.asset?.name ?? ""} · ${typeLabel(r.type)}`}
        />
      ),
    },
    {
      key: "by",
      header: "Reported By",
      priority: "secondary",
      render: (r) => (r.reporter ? personName(r.reporter) : "—"),
    },
    {
      key: "when",
      header: "Reported",
      priority: "hidden",
      render: (r) => fromNow(r.createdAt),
    },
    {
      key: "priority",
      header: "Priority",
      priority: "secondary",
      render: (r) =>
        r.priority ? (
          <StatusBadge
            tone={priorityTone(String(r.priority).toLowerCase())}
            plain
          >
            <span style={{ textTransform: "capitalize" }}>{r.priority}</span>
          </StatusBadge>
        ) : (
          <span className="px-tertiary">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => (
        <StatusBadge tone={STATUS[r.status]?.tone ?? "neutral"}>
          {STATUS[r.status]?.label ?? r.status}
        </StatusBadge>
      ),
    },
  ];

  const next = selected && manager ? (NEXT[selected.status] ?? []) : [];
  return (
    <Page
      title="Asset Issues"
      actions={
        <Button
          data-tour="issues-report"
          variant="primary"
          icon="plus"
          onClick={() => setReporting(true)}
        >
          Report an Issue
        </Button>
      }
      tabs={
        <SegmentedControl
          role="radiogroup"
          label="Status"
          value={status}
          onChange={setStatus}
          segments={[
            { value: "All", label: "All" },
            ...Object.entries(STATUS).map(([v, s]) => ({
              value: v,
              label: s.label,
            })),
          ]}
        />
      }
      inspector={
        <Inspector
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title="Issue"
          id={selected?.id}
          footer={
            next.length > 0 && (
              <>
                {next.map((n) => (
                  <Button
                    key={n.status}
                    variant={
                      n.status === "rejected" ? "tintedDanger" : "primary"
                    }
                    onClick={() => setTarget(n.status)}
                  >
                    {n.label}
                  </Button>
                ))}
              </>
            )
          }
        >
          {selected && (
            <div style={{ display: "grid", gap: 16 }}>
              <p className="px-section">{selected.title}</p>
              <KeyValues
                items={[
                  [
                    "Status",
                    <StatusBadge
                      tone={STATUS[selected.status]?.tone ?? "neutral"}
                    >
                      {STATUS[selected.status]?.label}
                    </StatusBadge>,
                  ],
                  [
                    "Asset",
                    `${selected.asset?.assetCode ?? ""} ${selected.asset?.name ?? ""}`.trim() ||
                      null,
                  ],
                  ["Type", typeLabel(selected.type)],
                  ["Priority", selected.priority],
                  [
                    "Reported By",
                    selected.reporter ? personName(selected.reporter) : null,
                  ],
                  ["Reported", fmtDate(selected.createdAt)],
                  ["HR Notes", selected.hrNotes ?? selected.notes],
                ]}
              />
              {selected.description && (
                <p style={{ whiteSpace: "pre-wrap" }}>{selected.description}</p>
              )}
            </div>
          )}
        </Inspector>
      }
    >
      <DataTable
        label="Asset issues"
        tour="issues-table"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.id)}
        loading={list.loading}
        onRowClick={setSelected}
        selectedId={selected?.id ?? null}
        stickyOffset={52}
        empty={{
          icon: "laptop",
          title: "No issues reported",
          body: "Report a fault, damage, or loss and it’s tracked here.",
        }}
        footer={<Pagination {...list.pageProps} />}
      />
      <ReportIssue
        manager={manager}
        open={reporting}
        onClose={() => setReporting(false)}
        onDone={() => {
          setReporting(false);
          list.refresh();
        }}
      />
      <Dialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        busy={busy}
        size="sm"
        title={next.find((n) => n.status === target)?.label ?? "Update Issue"}
        footer={
          <>
            <Button onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              variant={target === "rejected" ? "danger" : "primary"}
              busy={busy}
              onClick={act}
            >
              {next.find((n) => n.status === target)?.label ?? "Update"}
            </Button>
          </>
        }
      >
        <Field label="Notes" optional hint="The reporter can see these.">
          <TextArea
            data-autofocus
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </Dialog>
    </Page>
  );
}

function ReportIssue({
  manager,
  open,
  onClose,
  onDone,
}: {
  manager: boolean;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const EMPTY = {
    assetId: "",
    type: "malfunction",
    priority: "medium",
    title: "",
    description: "",
  };
  const [f, setF] = useState(EMPTY);
  const [assets, setAssets] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(EMPTY);
    setErrors({});
    // Managers can report on any assigned asset; others on their own (Classic's rule).
    apiClient
      .get(manager ? "/assets?status=assigned&limit=200" : "/assets?limit=100")
      .then((res) => setAssets(asList(res.data?.data ?? res.data, "assets")))
      .catch(() => setAssets([]));
  }, [open, manager]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!f.assetId) n.assetId = "Choose the asset.";
    if (!f.title.trim()) n.title = "Give the issue a short title.";
    setErrors(n);
    if (Object.keys(n).length) return;
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.REPORT_ASSET_ISSUE, f);
      setAlert({ open: true, message: "Issue reported.", severity: "success" });
      onDone();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={saving}
      title="Report an Issue"
      description="Tell the asset team what’s wrong. You can follow its status on this page."
      icon={{ name: "alert", tone: "warning" }}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form="issue-form"
            busy={saving}
          >
            Report Issue
          </Button>
        </>
      }
    >
      <form id="issue-form" onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Field label="Asset" error={errors.assetId} className={fieldSpan2}>
            <Select data-autofocus value={f.assetId} onChange={set("assetId")}>
              <option value="">
                {assets.length ? "Choose…" : "No assets to report on"}
              </option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assetCode} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={f.type} onChange={set("type")}>
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={set("priority")}>
              {PRIORITIES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" error={errors.title} className={fieldSpan2}>
            <TextInput
              value={f.title}
              onChange={set("title")}
              placeholder="Battery drains overnight"
            />
          </Field>
          <Field
            label="Details"
            optional
            hint="When it started, how often it happens, anything you’ve tried."
            className={fieldSpan2}
          >
            <TextArea
              rows={4}
              value={f.description}
              onChange={set("description")}
            />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}
