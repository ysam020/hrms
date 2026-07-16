import { useCallback, useState } from "react";

type AlertSeverity = "success" | "error" | "info" | "warning";
type SetAlert = (alert: {
  open: boolean;
  message: string;
  severity: AlertSeverity;
}) => void;

export interface UseCrudDialogOptions<T, TForm, TPayload = TForm> {
  emptyForm: TForm;
  /** Maps an existing item onto the edit form's shape when "Edit" is opened. */
  toForm: (item: T) => TForm;
  /** Transforms the raw form state into the API payload. Defaults to identity. */
  buildPayload?: (form: TForm) => TPayload;
  getId: (item: T) => string;
  create: (payload: TPayload) => Promise<unknown>;
  update: (id: string, payload: TPayload) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onRefetch: () => Promise<void>;
  setAlert: SetAlert;
  labels: {
    created: string;
    updated: string;
    deleted: string;
    saveFailed: string;
    deleteFailed: string;
  };
}

/**
 * Encapsulates the add/edit-dialog + delete-confirmation state and handlers
 * shared by every "list of records with a create/edit dialog and a delete
 * confirmation" settings screen (salary components, PT slabs, pay cycles,
 * income tax slabs, notice period bands, exit checklist items, ...) — each
 * of those previously hand-rolled this same five-piece-of-state, four-handler
 * pattern independently.
 */
export function useCrudDialog<T, TForm, TPayload = TForm>(
  options: UseCrudDialogOptions<T, TForm, TPayload>,
) {
  const {
    emptyForm,
    toForm,
    buildPayload,
    getId,
    create,
    update,
    remove,
    onRefetch,
    setAlert,
    labels,
  } = options;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<TForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const openAdd = useCallback(() => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }, [emptyForm]);

  const openEdit = useCallback(
    (item: T) => {
      setEditing(item);
      setForm(toForm(item));
      setDialogOpen(true);
    },
    [toForm],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const payload = (buildPayload ? buildPayload(form) : form) as TPayload;
      if (editing) {
        await update(getId(editing), payload);
      } else {
        await create(payload);
      }
      setAlert({
        open: true,
        message: editing ? labels.updated : labels.created,
        severity: "success",
      });
      setDialogOpen(false);
      await onRefetch();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? labels.saveFailed,
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [
    form,
    editing,
    buildPayload,
    create,
    update,
    getId,
    onRefetch,
    setAlert,
    labels,
  ]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await remove(getId(deleteTarget));
      setAlert({ open: true, message: labels.deleted, severity: "info" });
      setDeleteTarget(null);
      await onRefetch();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? labels.deleteFailed,
        severity: "error",
      });
    }
  }, [deleteTarget, remove, getId, onRefetch, setAlert, labels]);

  return {
    dialogOpen,
    setDialogOpen,
    editing,
    form,
    setForm,
    saving,
    deleteTarget,
    setDeleteTarget,
    openAdd,
    openEdit,
    save,
    confirmDelete,
  };
}
