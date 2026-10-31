import {
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { hrActivitiesSchema } from "@web/shared/schemas/hrActivities";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { StaggerItem, StaggerList } from "@next/motion";
import {
  Icon,
  DateTile,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  FormGrid,
  Menu,
  IconButton,
  Page,
  Pagination,
  SegmentedControl,
  Skeleton,
  Status,
  TextArea,
  TextInput,
  fieldSpan2,
} from "@next/ui";
import { DraftNote, sendOrQueue, useOfflineDraft } from "@next/offline";
import { apiClient, errorMessage, isCanceled } from "@next/lib/api";
import { fmtDate } from "@next/lib/format";
import s from "./announcements.module.css";

// Announcements (Classic: HR Activities). Reads GET /get-hr-activities with
// Classic's Active/Expired filter; create/edit/delete follow the
// HRActivities:create/edit/delete permissions and reuse hrActivitiesSchema.

const stripHtml = (html: string) =>
  new DOMParser().parseFromString(String(html ?? ""), "text/html").body
    .textContent || "";

export default function Announcements() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const perm = (a: string) =>
    hasPermission(
      "HRActivities",
      a,
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );
  const [status, setStatus] = useState<"Active" | "Expired">("Active");
  const [editing, setEditing] = useState<any | "new" | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(
    async ({ page, limit }: { page: number; limit: number }) => {
      try {
        const res = await apiClient.get(
          API_ENDPOINTS.GET_HR_ACTIVITIES(page, limit, status),
        );
        return {
          data: res.data?.data?.activities ?? [],
          totalCount:
            res.data?.data?.pagination?.totalCount ??
            res.data?.data?.total ??
            0,
        };
      } catch (err) {
        if (!isCanceled(err))
          setAlert({
            open: true,
            message: errorMessage(err),
            severity: "error",
          });
        throw err;
      }
    },
    [status, setAlert],
  );
  const list = useServerPagination(fetchPage, {
    initialPageSize: 20,
    deps: [status],
  });

  const remove = async () => {
    setBusy(true);
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_HR_ACTIVITY(deleting.id || deleting._id),
      );
      setAlert({
        open: true,
        message: "Announcement deleted.",
        severity: "success",
      });
      setDeleting(null);
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Announcements"
      width="reading"
      actions={
        perm("create") && (
          <Button
            data-tour="announce-new"
            variant="primary"
            icon="plus"
            onClick={() => setEditing("new")}
          >
            New Announcement
          </Button>
        )
      }
      tabs={
        <SegmentedControl
          role="radiogroup"
          label="Show"
          value={status}
          onChange={setStatus}
          segments={[
            { value: "Active", label: "Current" },
            { value: "Expired", label: "Past" },
          ]}
        />
      }
    >
      {list.loading && list.data.length === 0 ? (
        <div style={{ display: "grid", gap: 20 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "grid", gap: 8 }}>
              <Skeleton width={90} height={12} />
              <Skeleton width="70%" height={18} />
              <Skeleton width="90%" />
            </div>
          ))}
        </div>
      ) : list.data.length === 0 ? (
        <EmptyState
          icon="megaphone"
          title={
            status === "Active"
              ? "No current announcements"
              : "No past announcements"
          }
        />
      ) : (
        <StaggerList className={s.feed} data-tour="announce-feed">
          {list.data.map((a: any, i: number) => (
            <StaggerItem
              key={a.id || a._id}
              index={i}
              className={s.post}
              data-past={status === "Expired" || undefined}
            >
              {a.date ? (
                <DateTile date={a.date} muted={status === "Expired"} />
              ) : (
                <span aria-hidden />
              )}
              <div className={s.content}>
                <h2 className={s.title}>{a.title}</h2>
                <div className={s.when}>
                  <span className={s.whenPart}>
                    <Icon name="calendar" size={14} />
                    <span className="px-num">{fmtDate(a.date)}</span>
                  </span>
                  {a.time && (
                    <span className={s.whenPart}>
                      <Icon name="clock" size={14} />
                      <span className="px-num">{a.time}</span>
                    </span>
                  )}
                  {a.status && a.status !== "Active" && (
                    <Status value={a.status} />
                  )}
                </div>
                <p className={s.body}>{stripHtml(a.description)}</p>
              </div>
              {(perm("edit") || perm("delete")) && (
                <PostMenu
                  canEdit={perm("edit")}
                  canDelete={perm("delete")}
                  onEdit={() => setEditing(a)}
                  onDelete={() => setDeleting(a)}
                />
              )}
            </StaggerItem>
          ))}
        </StaggerList>
      )}
      <Pagination
        page={list.currentPage}
        pageSize={list.pageSize}
        total={list.totalCount}
        onPage={(p) => list.goToPage(p - 1)}
      />
      <EditAnnouncement
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          list.refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Delete Announcement?"
        description={deleting?.title}
        confirmLabel="Delete"
      />
    </Page>
  );
}

function PostMenu({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className={s.menu}>
      <IconButton
        ref={ref}
        icon="more"
        label="Announcement actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={ref}
        label="Announcement actions"
        items={[
          ...(canEdit
            ? [{ label: "Edit…", icon: "edit" as const, onSelect: onEdit }]
            : []),
          ...(canDelete
            ? [
                {
                  label: "Delete…",
                  icon: "trash" as const,
                  tone: "danger" as const,
                  onSelect: onDelete,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

function EditAnnouncement({
  value,
  onClose,
  onSaved,
}: {
  value: any | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const isNew = value === "new";
  // The form as the server has it (or blank for a new announcement).
  const initial = useMemo(
    () =>
      !value || value === "new"
        ? { title: "", description: "", date: "", time: "" }
        : {
            title: value.title || "",
            description: stripHtml(value.description),
            date: (value.date || "").slice(0, 10),
            time: value.time || "",
          },
    [value],
  );
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!value) return;
    setErrors({});
    setV(initial);
  }, [value, initial]);
  const id = !value || isNew ? null : String(value.id || value._id);
  // The version this edit started from; the server refuses the save if the
  // announcement has changed since (If-Match), instead of overwriting it.
  const version = value?.lastUpdatedOn
    ? new Date(value.lastUpdatedOn).toISOString()
    : undefined;
  const draft = useOfflineDraft({
    formKey: id ? `announcement.edit:${id}` : "announcement.new",
    values: v,
    setValues: setV,
    initial,
    enabled: Boolean(value),
    baseVersion: version,
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = hrActivitiesSchema.safeParse(v);
    if (!parsed.success) {
      const n: Record<string, string> = {};
      for (const i of parsed.error.issues) n[String(i.path[0])] ??= i.message;
      setErrors(n);
      return;
    }
    setSaving(true);
    try {
      const result = await sendOrQueue(
        id
          ? {
              kind: "announcement.edit",
              label: `Edit announcement · ${v.title.trim()}`,
              method: "PUT",
              url: API_ENDPOINTS.EDIT_HR_ACTIVITY(id),
              body: v,
              ifMatch: version,
            }
          : {
              kind: "announcement.create",
              label: `Announcement · ${v.title.trim()}`,
              method: "POST",
              url: API_ENDPOINTS.ADD_HR_ACTIVITY,
              body: v,
            },
      );
      await draft.clear();
      setAlert({
        open: true,
        message: result.queued
          ? "Saved on this device. It will be published when you’re back online."
          : result.data?.message || "Announcement saved.",
        severity: result.queued ? "info" : "success",
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
      title={isNew ? "New Announcement" : "Edit Announcement"}
      description="Everyone in the organisation sees it on the Announcements page."
      icon={{ name: "megaphone", tone: "accent" }}
      footer={
        <>
          <DraftNote
            status={draft.status}
            savedAt={draft.savedAt}
            onDiscard={async () => {
              await draft.clear();
              setV(initial);
            }}
          />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="ann-form" busy={saving}>
            {isNew ? "Publish" : "Save Changes"}
          </Button>
        </>
      }
    >
      <form id="ann-form" onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Field
            label="Title"
            error={errors.title}
            hint="3–50 characters"
            className={fieldSpan2}
          >
            <TextInput
              data-autofocus
              value={v.title}
              onChange={set("title")}
              maxLength={50}
            />
          </Field>
          <Field
            label="Details"
            error={errors.description}
            hint={`${v.description.length}/200`}
            className={fieldSpan2}
          >
            <TextArea
              value={v.description}
              onChange={set("description")}
              maxLength={200}
              rows={4}
            />
          </Field>
          <Field label="Date" error={errors.date} hint="When it happens">
            <TextInput type="date" value={v.date} onChange={set("date")} />
          </Field>
          <Field label="Time" error={errors.time} hint="Shown with the date">
            <TextInput type="time" value={v.time} onChange={set("time")} />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}
