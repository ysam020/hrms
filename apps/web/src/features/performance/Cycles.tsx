import dayjs from "dayjs";
import { useContext, useEffect, useState, type FormEvent } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  FormGrid,
  Page,
  Pagination,
  PeoplePicker,
  PrimaryCell,
  SearchField,
  SegmentedControl,
  Status,
  TextInput,
  fieldSpan2,
  type Column,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate } from "@next/lib/format";

// Review cycles (Classic's PerformanceReviewCycles): list, create/edit with
// participants (POST/PATCH /performance-reviews/cycles), close and delete
// (PATCH …/status). Gated by canManageReviews in the router.

type Form = {
  name: string;
  periodStart: string;
  periodEnd: string;
  ratingScale: string;
  userIds: string[];
};
const EMPTY: Form = {
  name: "",
  periodStart: "",
  periodEnd: "",
  ratingScale: "5",
  userIds: [],
};

export default function Cycles() {
  const { setAlert } = useContext(AlertContext);
  const [status, setStatus] = useState("All");
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.REVIEW_CYCLES(
        p,
        l,
        `${searchParam(q)}${status !== "All" ? `&status=${status}` : ""}`,
      ),
    {
      deps: [status],
      listKeys: ["cycles"],
    },
  );
  const [editing, setEditing] = useState<any | "new" | null>(null);
  const [action, setAction] = useState<{
    row: any;
    to: "closed" | "deleted";
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await apiClient.patch(API_ENDPOINTS.REVIEW_CYCLE_STATUS(action.row.id), {
        status: action.to,
      });
      setAlert({
        open: true,
        message:
          action.to === "closed"
            ? "Review cycle closed."
            : "Review cycle deleted.",
        severity: "success",
      });
      setAction(null);
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Cycle",
      priority: "primary",
      render: (c) => (
        <PrimaryCell
          title={c.name}
          subtitle={`${fmtDate(c.periodStart)} – ${fmtDate(c.periodEnd)}`}
        />
      ),
    },
    {
      key: "scale",
      header: "Scale",
      align: "right",
      priority: "secondary",
      stackLabel: "Scale",
      render: (c) => `1–${c.ratingScale ?? 5}`,
    },
    {
      key: "created",
      header: "Created",
      priority: "hidden",
      render: (c) => fmtDate(c.createdAt),
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (c) => (
        <Status
          value={
            c.status ? c.status[0].toUpperCase() + c.status.slice(1) : null
          }
        />
      ),
    },
    {
      key: "act",
      header: <span className="px-sr-only">Actions</span>,
      align: "right",
      priority: "secondary",
      render: (c) => (
        <div
          className="px-row"
          style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
        >
          <Button size="small" variant="plain" onClick={() => setEditing(c)}>
            Edit
          </Button>
          {c.status === "active" && (
            <Button
              size="small"
              variant="tinted"
              onClick={() => setAction({ row: c, to: "closed" })}
            >
              Close
            </Button>
          )}
          <Button
            size="small"
            variant="plain"
            onClick={() => setAction({ row: c, to: "deleted" })}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Page
      title="Review Cycles"
      actions={
        <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
          New Cycle
        </Button>
      }
      tabs={
        <>
          <SegmentedControl
            role="radiogroup"
            label="Status"
            value={status}
            onChange={setStatus}
            segments={[
              { value: "All", label: "All" },
              { value: "draft", label: "Draft" },
              { value: "active", label: "Active" },
              { value: "closed", label: "Closed" },
            ]}
          />
          <SearchField
            label="Search cycles"
            value={list.query}
            onChange={(e) => list.search(e.target.value)}
            toolbarWidth={220}
            trailing
          />
        </>
      }
    >
      <DataTable
        label="Review cycles"
        columns={columns}
        rows={list.data}
        rowId={(c) => String(c.id)}
        loading={list.loading}
        stickyOffset={52}
        empty={{
          icon: "star",
          title: "No review cycles",
          body: "Create a cycle to start self-assessments and manager reviews.",
        }}
        footer={<Pagination {...list.pageProps} />}
      />
      <CycleDialog
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          list.refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        onConfirm={act}
        busy={busy}
        tone={action?.to === "closed" ? "accent" : "danger"}
        title={
          action?.to === "closed"
            ? "Close Review Cycle?"
            : "Delete Review Cycle?"
        }
        description={
          action?.to === "closed"
            ? "No further reviews can be submitted in this cycle."
            : "The cycle and its reviews are removed."
        }
        confirmLabel={action?.to === "closed" ? "Close Cycle" : "Delete"}
      />
    </Page>
  );
}

function CycleDialog({
  value,
  onClose,
  onSaved,
}: {
  value: any | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const isNew = value === "new";

  useEffect(() => {
    if (!value) return;
    setErrors({});
    if (value === "new") return setF(EMPTY);
    setF({
      name: value.name,
      periodStart: (value.periodStart ?? "").slice(0, 10),
      periodEnd: (value.periodEnd ?? "").slice(0, 10),
      ratingScale: String(value.ratingScale ?? 5),
      userIds: [],
    });
    // Current participants are the people with a review in this cycle.
    apiClient
      .get(API_ENDPOINTS.CYCLE_REVIEWS(value.id))
      .then((res) =>
        setF((x) => ({
          ...x,
          userIds: asList<any>(res.data?.data).map((r) => String(r.userId)),
        })),
      )
      .catch(() => {});
  }, [value]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!f.name.trim()) n.name = "Name the cycle.";
    if (!f.periodStart) n.periodStart = "Choose a start date.";
    if (!f.periodEnd) n.periodEnd = "Choose an end date.";
    else if (f.periodStart && dayjs(f.periodEnd).isBefore(f.periodStart))
      n.periodEnd = "End must be after the start.";
    setErrors(n);
    if (Object.keys(n).length) return;
    const payload = {
      name: f.name.trim(),
      periodStart: f.periodStart,
      periodEnd: f.periodEnd,
      ratingScale: Number(f.ratingScale) || 5,
      userIds: f.userIds,
    };
    setSaving(true);
    try {
      if (isNew)
        await apiClient.post(API_ENDPOINTS.CREATE_REVIEW_CYCLE, payload);
      else await apiClient.patch(API_ENDPOINTS.REVIEW_CYCLE(value.id), payload);
      setAlert({
        open: true,
        message: isNew ? "Review cycle created." : "Review cycle updated.",
        severity: "success",
      });
      onSaved();
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
      size="lg"
      title={isNew ? "New Review Cycle" : "Edit Review Cycle"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form="cycle-form"
            busy={saving}
          >
            {isNew ? "Create Cycle" : "Save Changes"}
          </Button>
        </>
      }
    >
      <form
        id="cycle-form"
        onSubmit={submit}
        noValidate
        style={{ display: "grid", gap: 18 }}
      >
        <FormGrid columns={2}>
          <Field label="Name" error={errors.name} className={fieldSpan2}>
            <TextInput
              data-autofocus
              value={f.name}
              onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))}
              placeholder="H2 2026 Review"
            />
          </Field>
          <Field label="Period Starts" error={errors.periodStart}>
            <TextInput
              type="date"
              value={f.periodStart}
              onChange={(e) =>
                setF((x) => ({ ...x, periodStart: e.target.value }))
              }
            />
          </Field>
          <Field label="Period Ends" error={errors.periodEnd}>
            <TextInput
              type="date"
              min={f.periodStart}
              value={f.periodEnd}
              onChange={(e) =>
                setF((x) => ({ ...x, periodEnd: e.target.value }))
              }
            />
          </Field>
          <Field label="Rating Scale" hint="Ratings run from 1 to this number.">
            <TextInput
              type="number"
              min={3}
              max={10}
              inputMode="numeric"
              value={f.ratingScale}
              onChange={(e) =>
                setF((x) => ({ ...x, ratingScale: e.target.value }))
              }
            />
          </Field>
        </FormGrid>
        <Field
          label="Participants"
          hint="Each person gets a review in this cycle."
        >
          <PeoplePicker
            value={f.userIds}
            onChange={(ids) => setF((x) => ({ ...x, userIds: ids }))}
          />
        </Field>
      </form>
    </Dialog>
  );
}
