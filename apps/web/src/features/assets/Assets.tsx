import { useContext, useEffect, useState, type FormEvent } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import useAssetCategoryOptions from "@web/features/assets/useAssetCategoryOptions";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  FormGrid,
  Icon,
  Inspector,
  KeyValues,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  SegmentedControl,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  fieldSpan2,
  UserCombobox,
  type Column,
  type Tone,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fmtMoney, personName } from "@next/lib/format";

// Asset inventory (Classic's AssetInventory): GET /assets — the server scopes
// non-managers to their own assignments — plus create, assign, return,
// retire, and mark-available with the same endpoints, payloads, and the
// "Assets:manage or HR and above" rule.

export const ASSET_STATUS: Record<string, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "success" },
  assigned: { label: "Assigned", tone: "accent" },
  maintenance: { label: "In Maintenance", tone: "warning" },
  retired: { label: "Retired", tone: "neutral" },
};
const CONDITIONS = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "damaged", label: "Damaged" },
];

export const useCanManageAssets = () => {
  const { user } = useContext(UserContext);
  return (
    isHrOrAbove(user) ||
    hasPermission(
      "Assets",
      "manage",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    )
  );
};

export function AssetBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={ASSET_STATUS[status]?.tone ?? "neutral"}>
      {ASSET_STATUS[status]?.label ?? status}
    </StatusBadge>
  );
}

type Action = {
  kind: "assign" | "return" | "retire" | "available";
  asset: any;
};

export default function Assets() {
  const { setAlert } = useContext(AlertContext);
  const manager = useCanManageAssets();
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.ASSETS(
        p,
        l,
        `${searchParam(q)}${status !== "All" ? `&status=${status}` : ""}`,
      ),
    {
      deps: [status],
      listKeys: ["assets"],
    },
  );

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setAlert({ open: true, message: ok, severity: "success" });
      setAction(null);
      setSelected(null);
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const actionsFor = (a: any): Action["kind"][] => {
    if (!manager) return [];
    if (a.status === "available") return ["assign", "retire"];
    if (a.status === "assigned") return ["return"];
    if (a.status === "maintenance") return ["available", "retire"];
    return [];
  };
  const LABEL: Record<Action["kind"], string> = {
    assign: "Assign",
    return: "Return",
    retire: "Retire",
    available: "Mark Available",
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Asset",
      priority: "primary",
      render: (a) => (
        <PrimaryCell
          leading={
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--px-neutral-soft)",
                color: "var(--px-text-2)",
              }}
            >
              <Icon name="laptop" />
            </span>
          }
          title={a.name}
          subtitle={a.assetCode}
        />
      ),
    },
    {
      key: "category",
      header: "Category",
      priority: "secondary",
      render: (a) => a.category || "—",
    },
    {
      key: "holder",
      header: "With",
      priority: "secondary",
      stackLabel: "With",
      render: (a) =>
        a.currentHolder ? (
          personName(a.currentHolder)
        ) : (
          <span className="px-tertiary">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (a) => <AssetBadge status={a.status} />,
    },
  ];

  return (
    <Page
      title="Asset Inventory"
      subtitle={manager ? undefined : "Equipment assigned to you"}
      actions={
        manager && (
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setCreating(true)}
          >
            Add Asset
          </Button>
        )
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
              ...Object.entries(ASSET_STATUS).map(([v, s]) => ({
                value: v,
                label: s.label,
              })),
            ]}
          />
          <SearchField
            label="Search assets"
            value={list.query}
            onChange={(e) => list.search(e.target.value)}
            toolbarWidth={220}
            trailing
          />
        </>
      }
      inspector={
        <Inspector
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title="Asset"
          id={selected?.id}
          footer={
            selected &&
            actionsFor(selected).length > 0 && (
              <>
                {actionsFor(selected).map((k) => (
                  <Button
                    key={k}
                    variant={
                      k === "retire"
                        ? "tintedDanger"
                        : k === "assign"
                          ? "primary"
                          : "tinted"
                    }
                    onClick={() => setAction({ kind: k, asset: selected })}
                  >
                    {LABEL[k]}
                  </Button>
                ))}
              </>
            )
          }
        >
          {selected && (
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <p className="px-section">{selected.name}</p>
                <p className="px-meta px-num">{selected.assetCode}</p>
              </div>
              <KeyValues
                items={[
                  ["Status", <AssetBadge status={selected.status} />],
                  ["Category", selected.category],
                  [
                    "With",
                    selected.currentHolder
                      ? personName(selected.currentHolder)
                      : null,
                  ],
                  [
                    "Purchased",
                    selected.purchaseDate
                      ? fmtDate(selected.purchaseDate)
                      : null,
                  ],
                  [
                    "Value",
                    selected.purchaseValue
                      ? fmtMoney(selected.purchaseValue)
                      : null,
                  ],
                  ["Notes", selected.notes],
                ]}
              />
            </div>
          )}
        </Inspector>
      }
    >
      <DataTable
        label="Assets"
        columns={columns}
        rows={list.data}
        rowId={(a) => String(a.id)}
        loading={list.loading}
        onRowClick={setSelected}
        selectedId={selected?.id ?? null}
        stickyOffset={52}
        empty={{
          icon: "laptop",
          title: manager ? "No assets match" : "No equipment assigned to you",
        }}
        footer={<Pagination {...list.pageProps} />}
      />
      <CreateAsset
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          list.refresh();
        }}
      />
      <AssignOrReturn
        action={
          action?.kind === "assign" || action?.kind === "return" ? action : null
        }
        busy={busy}
        onClose={() => setAction(null)}
        onSubmit={(body) =>
          action?.kind === "assign"
            ? run(
                () =>
                  apiClient.post(API_ENDPOINTS.ASSIGN_ASSET, {
                    assetId: action.asset.id,
                    ...body,
                  }),
                "Asset assigned.",
              )
            : run(
                () =>
                  apiClient.post(API_ENDPOINTS.RETURN_ASSET, {
                    assetId: action!.asset.id,
                    ...body,
                  }),
                "Asset returned.",
              )
        }
      />
      <ConfirmDialog
        open={action?.kind === "retire" || action?.kind === "available"}
        onClose={() => setAction(null)}
        busy={busy}
        tone={action?.kind === "retire" ? "danger" : "accent"}
        title={
          action?.kind === "retire"
            ? `Retire ${action?.asset.assetCode}?`
            : `Return ${action?.asset.assetCode} to Service?`
        }
        description={
          action?.kind === "retire"
            ? "Retired assets can’t be assigned again."
            : "The asset becomes available to assign."
        }
        confirmLabel={action?.kind === "retire" ? "Retire" : "Mark Available"}
        onConfirm={() =>
          action?.kind === "retire"
            ? run(
                () =>
                  apiClient.post(API_ENDPOINTS.RETIRE_ASSET(action.asset.id)),
                "Asset retired.",
              )
            : run(
                () =>
                  apiClient.patch(
                    API_ENDPOINTS.UPDATE_ASSET(action!.asset.id),
                    { status: "available" },
                  ),
                "Asset available.",
              )
        }
      />
    </Page>
  );
}

function CreateAsset({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const { options, ensureAssetCategorySaved } = useAssetCategoryOptions();
  const EMPTY = {
    name: "",
    assetCode: "",
    category: "Laptop",
    notes: "",
    purchaseDate: "",
    purchaseValue: "",
  };
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setF(EMPTY);
      setErrors({});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!f.name.trim()) n.name = "Name the asset.";
    if (!f.assetCode.trim()) n.assetCode = "Give it an asset code.";
    if (!f.category.trim()) n.category = "Choose a category.";
    setErrors(n);
    if (Object.keys(n).length) return;
    setSaving(true);
    try {
      void ensureAssetCategorySaved(f.category);
      await apiClient.post(API_ENDPOINTS.CREATE_ASSET, {
        ...f,
        purchaseValue: f.purchaseValue ? Number(f.purchaseValue) : undefined,
      });
      setAlert({ open: true, message: "Asset added.", severity: "success" });
      onCreated();
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
      title="Add Asset"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form="asset-form"
            busy={saving}
          >
            Add Asset
          </Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Field label="Name" error={errors.name} className={fieldSpan2}>
            <TextInput
              data-autofocus
              value={f.name}
              onChange={set("name")}
              placeholder="MacBook Pro 14″"
            />
          </Field>
          <Field label="Asset Code" error={errors.assetCode}>
            <TextInput
              value={f.assetCode}
              onChange={set("assetCode")}
              placeholder="LAP-0042"
            />
          </Field>
          <Field label="Category" error={errors.category}>
            <TextInput
              list="asset-categories"
              value={f.category}
              onChange={set("category")}
            />
          </Field>
          <datalist id="asset-categories">
            {(options as any[]).map((o) => (
              <option
                key={String(o.value ?? o)}
                value={String(o.value ?? o.label ?? o)}
              />
            ))}
          </datalist>
          <Field label="Purchased On" optional>
            <TextInput
              type="date"
              value={f.purchaseDate}
              onChange={set("purchaseDate")}
            />
          </Field>
          <Field label="Value (₹)" optional>
            <TextInput
              type="number"
              min={0}
              inputMode="numeric"
              value={f.purchaseValue}
              onChange={set("purchaseValue")}
            />
          </Field>
          <Field label="Notes" optional className={fieldSpan2}>
            <TextArea rows={2} value={f.notes} onChange={set("notes")} />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}

function AssignOrReturn({
  action,
  busy,
  onClose,
  onSubmit,
}: {
  action: Action | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, string>) => void;
}) {
  const [userId, setUserId] = useState("");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (action) {
      setUserId("");
      setCondition("good");
      setNotes("");
    }
  }, [action]);
  const assigning = action?.kind === "assign";
  return (
    <Dialog
      open={Boolean(action)}
      onClose={onClose}
      busy={busy}
      size="sm"
      title={
        assigning
          ? `Assign ${action?.asset.assetCode}`
          : `Return ${action?.asset.assetCode}`
      }
      description={action?.asset.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={assigning && !userId}
            onClick={() =>
              onSubmit(
                assigning
                  ? { userId, conditionOut: condition, notes }
                  : { conditionIn: condition, notes },
              )
            }
          >
            {assigning ? "Assign" : "Mark Returned"}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {assigning && (
          <Field label="Assign To">
            <UserCombobox
              data-autofocus
              value={userId}
              onChange={(id) => setUserId(id)}
            />
          </Field>
        )}
        <Field
          label={
            assigning ? "Condition When Handed Over" : "Condition When Returned"
          }
        >
          <Select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" optional>
          <TextArea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
