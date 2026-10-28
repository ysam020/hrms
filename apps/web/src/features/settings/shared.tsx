import dayjs from "dayjs";
import {
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";
import { useCrudDialog } from "@web/shared/hooks/useCrudDialog";
import {
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  Page,
  SegmentedControl,
  Skeleton,
  TextArea,
  TextInput,
  type Column,
  SectionsSkeleton,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { fmtDate } from "@next/lib/format";
import s from "./settings.module.css";

// Shared pieces for the Settings pages.

/** Classic's rule for editing organisation settings. */
export function useCanEditOrgSettings() {
  const { user } = useContext(UserContext);
  return (
    isOwnerOrAdmin(user) ||
    Boolean(
      user?.permissions?.includes("Organisation:edit_organisation_settings"),
    )
  );
}

// Defaults mirror Classic's SCHEMA_DEFAULTS (org-settings/types.ts), used
// when the server returns a partial snapshot.
export const SETTINGS_DEFAULTS = {
  workWeekPattern: { type: "mon_fri", workingDays: [1, 2, 3, 4, 5] },
  paidLeavesPerYear: 12,
  sickLeavesPerYear: 12,
  casualLeavesPerYear: 6,
  medicalCertRequired: false,
  customLeaveTypes: [] as any[],
  leavePolicies: [] as any[],
  workStartHour: 9,
  workStartMinute: 0,
  lateGracePeriodMinutes: 30,
  fullDayMinHours: 8,
  halfDayMinHours: 4,
  regularizationBackdateWindowDays: 3,
  overtimePreApprovalRequired: false,
  probationPeriodDays: 90,
  noticePeriodDays: 30,
  maxInterviewRounds: 5,
  geofencingEnabled: false,
  officeLatitude: null as number | null,
  officeLongitude: null as number | null,
  officeName: null as string | null,
  geofenceRadiusMeters: 200,
  wfhEnabled: true,
};
export type Snapshot = typeof SETTINGS_DEFAULTS & {
  id?: string | null;
  effectiveFrom?: string | null;
  note?: string | null;
} & Record<string, any>;

/**
 * Organisation settings (GET/PUT /tenant-settings). Changes are versioned:
 * saving asks when they take effect, as in Classic; pending versions can be
 * cancelled.
 */
export function useOrgSettings() {
  const { setUser } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [draft, setDraft] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<Snapshot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(API_ENDPOINTS.GET_ORG_SETTINGS);
      const d = res.data?.data ?? {};
      setDraft({ ...SETTINGS_DEFAULTS, ...(d.active ?? {}) });
      setPending(
        (d.pending ?? []).map((p: any) => ({ ...SETTINGS_DEFAULTS, ...p })),
      );
      setDirty(false);
    } catch (err) {
      setAlert({
        open: true,
        message: errorMessage(err, "Settings couldn’t be loaded."),
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [setAlert]);
  useEffect(() => {
    load();
  }, [load]);

  const change = (patch: Partial<Snapshot>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  const save = async (effectiveFrom: Date, note: string) => {
    await apiClient.put(API_ENDPOINTS.UPDATE_ORG_SETTINGS, {
      settings: draft,
      effectiveFrom: effectiveFrom.toISOString(),
      note: note || undefined,
    });
    setAlert({
      open: true,
      message:
        effectiveFrom <= new Date()
          ? "Settings applied."
          : `Settings scheduled for ${fmtDate(effectiveFrom)}.`,
      severity: "success",
    });
    await load();
    // Profile carries some tenant settings (e.g. wfhEnabled) that gate
    // navigation — refresh it when the change applies now (as Classic does).
    if (effectiveFrom <= new Date()) {
      apiClient
        .get(API_ENDPOINTS.GET_PROFILE)
        .then((r) => r.data?.success && setUser(r.data.data.user))
        .catch(() => {});
    }
  };

  const cancelPending = async (id: string) => {
    try {
      await apiClient.delete(API_ENDPOINTS.CANCEL_PENDING_ORG_SETTINGS(id));
      setAlert({
        open: true,
        message: "Scheduled change cancelled.",
        severity: "success",
      });
      await load();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };

  return {
    draft,
    pending,
    dirty,
    loading,
    change,
    save,
    cancelPending,
    reset: load,
  };
}

type OrgSettings = ReturnType<typeof useOrgSettings>;

/** Page frame for the versioned org-settings pages. */
export function OrgSettingsPage({
  title,
  subtitle,
  org,
  children,
}: {
  title: string;
  subtitle?: string;
  org: OrgSettings;
  children: (draft: Snapshot, readOnly: boolean) => ReactNode;
}) {
  const canEdit = useCanEditOrgSettings();
  const [saving, setSaving] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  return (
    <Page
      title={title}
      subtitle={subtitle}
      width="reading"
      actions={
        canEdit && (
          <>
            {org.dirty && <Button onClick={org.reset}>Discard</Button>}
            <Button
              variant="primary"
              disabled={!org.dirty}
              onClick={() => setSaving(true)}
            >
              Save Changes…
            </Button>
          </>
        )
      }
    >
      {org.loading || !org.draft ? (
        <SectionsSkeleton sections={3} fields={4} toggles={1} />
      ) : (
        <div style={{ display: "grid", gap: 28 }}>
          {!canEdit && (
            <Banner tone="neutral">
              You can view these settings. Changing them needs
              organisation-settings access.
            </Banner>
          )}
          {org.pending.length > 0 && (
            <Banner tone="warning">
              <b>Scheduled changes.</b>{" "}
              {org.pending.map((p, i) => (
                <span key={p.id ?? i}>
                  {i > 0 && "; "}
                  takes effect {fmtDate(p.effectiveFrom)}
                  {p.note ? ` — ${p.note}` : ""}
                  {canEdit && p.id && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="px-link-button"
                        onClick={() => setCancelId(p.id!)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </span>
              ))}
            </Banner>
          )}
          {children(org.draft, !canEdit)}
        </div>
      )}
      <SaveDialog
        open={saving}
        onClose={() => setSaving(false)}
        onSave={org.save}
      />
      <ConfirmDialog
        open={Boolean(cancelId)}
        onClose={() => setCancelId(null)}
        onConfirm={async () => {
          await org.cancelPending(cancelId!);
          setCancelId(null);
        }}
        title="Cancel Scheduled Change?"
        confirmLabel="Cancel Change"
      />
    </Page>
  );
}

/** When the change takes effect (Classic's SaveDialog options). */
function SaveDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (when: Date, note: string) => Promise<void>;
}) {
  const { setAlert } = useContext(AlertContext);
  const [when, setWhen] = useState("now");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setWhen("now");
      setCustom("");
      setNote("");
    }
  }, [open]);
  const date = () => {
    if (when === "month")
      return dayjs().add(1, "month").startOf("month").toDate();
    if (when === "year") return dayjs().add(1, "year").startOf("year").toDate();
    if (when === "custom" && custom)
      return dayjs(custom).startOf("day").toDate();
    return new Date();
  };
  const go = async () => {
    setBusy(true);
    try {
      await onSave(date(), note);
      onClose();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      title="Save Settings"
      description="Choose when the change takes effect. Earlier versions stay on record."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={when === "custom" && !custom}
            onClick={go}
          >
            Save
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <Field label="Takes Effect">
          <SegmentedControl
            role="radiogroup"
            label="Takes effect"
            value={when}
            onChange={setWhen}
            segments={[
              { value: "now", label: "Now" },
              { value: "month", label: "Next Month" },
              { value: "year", label: "Next Year" },
              { value: "custom", label: "On a Date" },
            ]}
          />
        </Field>
        {when === "custom" && (
          <Field label="Date">
            <TextInput
              type="date"
              min={dayjs().add(1, "day").format("YYYY-MM-DD")}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </Field>
        )}
        <Field
          label="Note"
          optional
          hint="Why the change — shown in the history."
        >
          <TextArea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}

/** A labelled numeric setting with its unit and help. */
export function SettingRow({
  label,
  help,
  children,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={s.row}>
      <div className={s.rowText}>
        <span className="px-label">{label}</span>
        {help && <span className="px-meta">{help}</span>}
      </div>
      <div className={s.rowControl}>{children}</div>
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
  label,
}: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  label: string;
}) {
  return (
    <span className="px-row" style={{ flexWrap: "nowrap", gap: 8 }}>
      <TextInput
        type="number"
        inputMode="decimal"
        aria-label={label}
        className={s.number}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n))
            onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
        }}
      />
      {unit && <span className="px-meta">{unit}</span>}
    </span>
  );
}

/**
 * CRUD list over Classic's useCrudDialog: same create/update/delete wiring,
 * presentation from Next. `form` renders the dialog fields.
 */
export function CrudSection<T, F>({
  title,
  detail,
  items,
  columns,
  canEdit,
  onRefetch,
  crud,
  noun,
  form,
  empty,
}: {
  title: string;
  detail?: ReactNode;
  items: T[];
  columns: Column<T>[];
  canEdit: boolean;
  onRefetch: () => Promise<void>;
  crud: Omit<
    Parameters<typeof useCrudDialog<T, F, any>>[0],
    "onRefetch" | "setAlert" | "labels"
  >;
  noun: string;
  form: (f: F, set: (patch: Partial<F>) => void) => ReactNode;
  empty?: string;
}) {
  const { setAlert } = useContext(AlertContext);
  const c = useCrudDialog<T, F, any>({
    ...crud,
    onRefetch,
    setAlert: setAlert as any,
    labels: {
      created: `${noun} added.`,
      updated: `${noun} updated.`,
      deleted: `${noun} deleted.`,
      saveFailed: `${noun} couldn’t be saved.`,
      deleteFailed: `${noun} couldn’t be deleted.`,
    },
  });
  const set = (patch: Partial<F>) => c.setForm((x: F) => ({ ...x, ...patch }));
  const withActions: Column<T>[] = canEdit
    ? [
        ...columns,
        {
          key: "__act",
          header: <span className="px-sr-only">Actions</span>,
          align: "right",
          priority: "trailing",
          render: (item) => (
            <span
              className="px-row"
              style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
            >
              <Button
                size="small"
                variant="plain"
                onClick={() => c.openEdit(item)}
              >
                Edit
              </Button>
              <Button
                size="small"
                variant="plain"
                onClick={() => c.setDeleteTarget(item)}
              >
                Delete
              </Button>
            </span>
          ),
        },
      ]
    : columns;
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <header className="px-row" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "grid" }}>
          <h2 className="px-section">{title}</h2>
          {detail && <span className="px-meta">{detail}</span>}
        </div>
        {canEdit && (
          <Button size="small" icon="plus" onClick={c.openAdd}>
            Add {noun}
          </Button>
        )}
      </header>
      <DataTable
        label={title}
        columns={withActions}
        rows={items}
        rowId={(i) => String(crud.getId(i))}
        empty={{ title: empty ?? `No ${noun.toLowerCase()}s yet` }}
      />
      <Dialog
        open={c.dialogOpen}
        onClose={() => c.setDialogOpen(false)}
        busy={c.saving}
        title={c.editing ? `Edit ${noun}` : `Add ${noun}`}
        footer={
          <>
            <Button onClick={() => c.setDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" busy={c.saving} onClick={() => c.save()}>
              Save
            </Button>
          </>
        }
      >
        {form(c.form, set)}
      </Dialog>
      <ConfirmDialog
        open={Boolean(c.deleteTarget)}
        onClose={() => c.setDeleteTarget(null)}
        onConfirm={() => c.confirmDelete()}
        busy={c.saving}
        title={`Delete ${noun}?`}
        confirmLabel="Delete"
      />
    </section>
  );
}
