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
import { permissionStructure } from "@web/assets/data/permissionStructure";
import togglePermission from "@web/shared/utils/permissions/togglePermission";
import saveUserPermissions from "@web/shared/utils/permissions/saveUserPermissions";
import handleRoleChange from "@web/shared/utils/permissions/handleRoleChange";
import {
  Avatar,
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Inspector,
  Page,
  PeoplePicker,
  PrimaryCell,
  SearchField,
  Select,
  Skeleton,
  Spinner,
  Switch,
  TextInput,
  inlineCheckClass,
  usePeople,
  UserCombobox,
  type Column,
  TableSkeleton,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import s from "./permissions.module.css";

// Permissions (Classic's Permissions module): roles and their permissions,
// per-user permissions and superuser status, and teams. Permission strings
// ("Module:action:scope" / "Module:action") and their editing semantics come
// from Classic's permissionStructure, togglePermission, handleRoleChange, and
// saveUserPermissions — only the presentation is new.

const modules = Object.keys(permissionStructure).sort((a, b) =>
  human(a).localeCompare(human(b)),
);
// Granted only inside Praesto's own organisation; the server rejects them
// everywhere else (PLATFORM_ONLY_MODULES in @hrms/common).
const PLATFORM_ONLY_MODULES = ["PraestoSupport"];
function human(v: string) {
  return v
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("K Y C", "KYC")
    .replace("H R", "HR")
    .replace("W F H", "WFH");
}
const SCOPE_LABEL: Record<string, string> = {
  "-": "Allowed",
  self: "Own",
  team: "Team",
  all: "Everyone",
};
const permString = (m: string, a: string, sc: string) =>
  sc === "-" ? `${m}:${a}` : `${m}:${a}:${sc}`;

/** Loading shape of PermissionMatrix: module list beside action rows. */
function MatrixSkeleton() {
  return (
    <div className={s.matrix} aria-hidden>
      <div className={s.modules} style={{ display: "grid", gap: 4 }}>
        {[64, 48, 72, 56, 80, 44, 68, 52, 60, 76].map((wd, i) => (
          <div key={i} className={s.module}>
            <Skeleton width={`${wd}%`} height={13} />
          </div>
        ))}
      </div>
      <div className={s.grid}>
        <Skeleton width={120} height={20} style={{ marginBottom: 8 }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={s.actionRow}>
            <Skeleton width={[90, 70, 110, 80][i]} height={13} />
            <span className="px-row">
              {Array.from({ length: i % 2 ? 2 : 3 }, (_, j) => (
                <Skeleton key={j} width={70} height={16} radius={4} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Module list + action × scope grid. `has`/`toggle` keep it agnostic of who it edits. */
function PermissionMatrix({
  has,
  toggle,
  disabled,
}: {
  has: (p: string) => boolean;
  toggle: (m: string, a: string, sc: string) => void;
  disabled?: boolean;
}) {
  const { user } = useContext(UserContext);
  const shown = user?.isPlatformTenant
    ? modules
    : modules.filter((m) => !PLATFORM_ONLY_MODULES.includes(m));
  const [active, setActive] = useState(shown[0]);
  const actions = (permissionStructure as any)[active]?.actions ?? {};
  const count = (m: string) =>
    Object.entries((permissionStructure as any)[m].actions).reduce(
      (n, [a, scopes]) =>
        n +
        (scopes as string[]).filter((sc) => has(permString(m, a, sc))).length,
      0,
    );
  return (
    <div className={s.matrix}>
      <nav aria-label="Modules" className={s.modules}>
        <ul>
          {shown.map((m) => (
            <li key={m}>
              <button
                type="button"
                className={s.module}
                aria-current={m === active ? "true" : undefined}
                onClick={() => setActive(m)}
              >
                <span>{human(m)}</span>
                {count(m) > 0 && (
                  <span className="px-meta px-num">{count(m)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div
        className={s.grid}
        role="group"
        aria-label={`${human(active)} permissions`}
      >
        <h3 className="px-section" style={{ marginBottom: 8 }}>
          {human(active)}
        </h3>
        {Object.entries(actions).map(([action, scopes]) => (
          <div key={action} className={s.actionRow}>
            <span className={s.actionName}>{human(action)}</span>
            <span className="px-row">
              {(scopes as string[]).map((sc) => (
                <label key={sc} className={inlineCheckClass}>
                  <Checkbox
                    checked={has(permString(active, action, sc))}
                    disabled={disabled}
                    onChange={() => toggle(active, action, sc)}
                  />
                  {SCOPE_LABEL[sc] ?? sc}
                </label>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Roles ───────────────────────────────────────────────────────────────────

export function RolesPage() {
  const { setAlert } = useContext(AlertContext);
  const roles = useGet<any>("/get-roles");
  const [selected, setSelected] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [unassign, setUnassign] = useState<{
    username: string;
    role: any;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = asList<any>(roles.data, "roles");

  const run = async (
    fn: () => Promise<unknown>,
    ok: string,
    after?: () => void,
  ) => {
    setBusy(true);
    try {
      await fn();
      setAlert({ open: true, message: ok, severity: "success" });
      after?.();
      roles.refetch();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Role",
      priority: "primary",
      render: (r) => <span className="px-headline">{r.name}</span>,
    },
    {
      key: "members",
      header: "People",
      priority: "trailing",
      align: "right",
      width: 200,
      render: (r) => {
        const people: any[] = r.assignedTo ?? [];
        if (!people.length)
          return <span className="px-meta px-tertiary">No one yet</span>;
        return (
          <span
            className="px-row"
            style={{ flexWrap: "nowrap", gap: 6, justifyContent: "flex-end" }}
          >
            <span className={s.stack}>
              {people.slice(0, 4).map((u) => (
                <Avatar
                  key={u.username ?? u.id}
                  name={u.fullName || u.name || u.username}
                  src={u.imageURL}
                  size={22}
                />
              ))}
            </span>
            <span className="px-meta px-num">{people.length}</span>
          </span>
        );
      },
    },
  ];
  return (
    <Page
      title="Roles"
      description="A role is a named set of permissions. Assign roles to people from User Permissions."
      actions={
        <Button
          data-tour="roles-new"
          variant="primary"
          icon="plus"
          onClick={() => setCreating(true)}
        >
          New Role
        </Button>
      }
      inspector={
        <Inspector
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title={selected?.name ?? "Role"}
          id={selected?._id}
          footer={
            selected && (
              <Button
                variant="tintedDanger"
                onClick={() => setDeleting(selected)}
              >
                Delete Role
              </Button>
            )
          }
        >
          {selected && (
            <div style={{ display: "grid", gap: 10 }}>
              <h3 className="px-headline">People With This Role</h3>
              {(selected.assignedTo ?? []).length === 0 ? (
                <p className="px-tertiary px-callout">
                  No one has this role yet. Assign it from User Permissions.
                </p>
              ) : (
                <ul className="px-hairline-list">
                  {selected.assignedTo.map((u: any) => (
                    <li
                      key={u.username}
                      className="px-row"
                      style={{ flexWrap: "nowrap", padding: "8px 0" }}
                    >
                      <Avatar
                        name={u.fullName || u.username}
                        src={u.imageURL}
                        size={28}
                      />
                      <span style={{ flex: 1 }}>
                        {u.fullName || u.username}
                      </span>
                      <Button
                        size="small"
                        variant="plain"
                        onClick={() =>
                          setUnassign({ username: u.username, role: selected })
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Inspector>
      }
    >
      {roles.loading && !list.length ? (
        <TableSkeleton rows={5} columns={2} />
      ) : (
        <DataTable
          label="Roles"
          tour="roles-table"
          columns={columns}
          rows={list}
          rowId={(r) => String(r._id)}
          onRowClick={setSelected}
          selectedId={selected?._id ?? null}
          empty={{
            icon: "key",
            title: "No roles yet",
            body: "A role bundles permissions you can give to many people at once.",
          }}
        />
      )}
      {selected && <RoleEditor role={selected} />}
      <CreateRole
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          roles.refetch();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        busy={busy}
        title={`Delete ${deleting?.name}?`}
        description="People with this role keep any permissions granted to them directly."
        confirmLabel="Delete Role"
        onConfirm={() =>
          run(
            () => apiClient.delete(API_ENDPOINTS.DELETE_ROLE(deleting._id)),
            "Role deleted.",
            () => {
              setDeleting(null);
              setSelected(null);
            },
          )
        }
      />
      <ConfirmDialog
        open={Boolean(unassign)}
        onClose={() => setUnassign(null)}
        busy={busy}
        title={`Remove ${unassign?.username} from ${unassign?.role.name}?`}
        confirmLabel="Remove"
        onConfirm={() =>
          run(
            () =>
              apiClient.post(API_ENDPOINTS.DELETE_USER_ROLE, {
                username: unassign!.username,
                roleId: unassign!.role._id,
              }),
            "Removed from role.",
            () => {
              setSelected((r: any) =>
                r
                  ? {
                      ...r,
                      assignedTo: (r.assignedTo ?? []).filter(
                        (u: any) => u.username !== unassign!.username,
                      ),
                    }
                  : r,
              );
              setUnassign(null);
            },
          )
        }
      />
    </Page>
  );
}

/** Permissions of the selected role, edited below the list. */
function RoleEditor({ role }: { role: any }) {
  const { setAlert } = useContext(AlertContext);
  const fetched = useGet<any>(`/get-role-permissions/${role._id}`);
  const [perms, setPerms] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const d = fetched.data;
    setPerms(Array.isArray(d) ? d : asList(d, "permissions"));
    setDirty(false);
  }, [fetched.data]);
  const all = perms.includes("*:*:*");
  const toggle = (m: string, a: string, sc: string) => {
    const p = permString(m, a, sc);
    setPerms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));
    setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_ROLE_PERMISSIONS(role._id), {
        permissions: perms,
      });
      setAlert({
        open: true,
        message: "Role permissions saved.",
        severity: "success",
      });
      setDirty(false);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <section style={{ display: "grid", gap: 12, marginTop: 32 }}>
      <div className="px-row" style={{ justifyContent: "space-between" }}>
        <h2 className="px-section">{role.name} Permissions</h2>
        <Button
          variant="primary"
          disabled={!dirty}
          busy={saving}
          onClick={save}
        >
          Save Permissions
        </Button>
      </div>
      {fetched.loading ? (
        <MatrixSkeleton />
      ) : (
        <PermissionMatrix
          has={(p) => all || perms.includes(p)}
          toggle={toggle}
          disabled={all}
        />
      )}
    </section>
  );
}

function CreateRole({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return setError("Name the role.");
    setSaving(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.CREATE_ROLE, {
        name: name.trim(),
      });
      setAlert({
        open: true,
        message: res.data?.message || "Role created.",
        severity: "success",
      });
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
      size="sm"
      title="New Role"
      description="Choose its permissions after creating it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={saving} onClick={() => submit()}>
            Create Role
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Name" error={error}>
          <TextInput
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team Lead"
          />
        </Field>
      </form>
    </Dialog>
  );
}

// ── User permissions ────────────────────────────────────────────────────────

export function UserPermissionsPage() {
  const { setAlert } = useContext(AlertContext);
  const { people, loading: loadingPeople } = usePeople();
  const roles = useGet<any>("/get-role-and-permissions");
  const [q, setQ] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const fetched = useGet<any>(
    username ? `/get-user-permissions/${encodeURIComponent(username)}` : null,
  );
  const superData = useGet<any>(
    username ? `/is-superuser/${encodeURIComponent(username)}` : null,
  );
  const [perms, setPerms] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [isSuper, setIsSuper] = useState(false);
  const [role, setRole] = useState<any | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const roleList = asList<any>(roles.data, "roles");

  useEffect(() => {
    const d = fetched.data;
    const list = Array.isArray(d) ? d : asList(d, "permissions");
    setPerms(list);
    setOriginal(list);
    setRole(null);
    setDirty(false);
  }, [fetched.data]);
  useEffect(
    () => setIsSuper(Boolean(superData.data?.isSuperUser)),
    [superData.data],
  );

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people
      .filter((p) => !t || `${p.name} ${p.username}`.toLowerCase().includes(t))
      .slice(0, 60);
  }, [people, q]);

  const setSuper = async (v: boolean) => {
    try {
      const res = await apiClient.put(
        API_ENDPOINTS.UPDATE_SUPERUSER(username!),
        { isSuperUser: v },
      );
      setIsSuper(v);
      if (v) setRole(null);
      setAlert({
        open: true,
        message: res.data?.message || "Updated.",
        severity: "success",
      });
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };
  const selectRole = (id: string) => {
    const r =
      roleList.find((x) => String(x._id ?? x.id ?? x.name) === id) ?? null;
    handleRoleChange(
      { value: r },
      setRole,
      setPerms,
      setIsSuper,
      setDirty,
      original,
    );
  };

  return (
    <Page
      title="User Permissions"
      width="wide"
      description="Choose a person to see their roles and individual permissions, and change what they can do."
    >
      <div className={s.users}>
        <aside
          className={s.userList}
          aria-label="People"
          data-tour="userperm-people"
        >
          <SearchField
            label="Find a person"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul>
            {loadingPeople && (
              <li className="px-meta" style={{ padding: 8 }}>
                <Spinner label="Loading people…" size="small" showLabel />
              </li>
            )}
            {shown.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={s.module}
                  aria-current={p.username === username ? "true" : undefined}
                  onClick={() => setUsername(p.username ?? null)}
                >
                  <span
                    className="px-row"
                    style={{ flexWrap: "nowrap", gap: 8 }}
                  >
                    <Avatar name={p.name} src={p.photo} size={24} />
                    <span className="px-truncate">{p.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div style={{ minWidth: 0 }}>
          {!username ? (
            <EmptyState icon="key" title="Choose a person">
              See and change exactly what they can do in Praesto.
            </EmptyState>
          ) : fetched.loading ? (
            <div style={{ display: "grid", gap: 18 }}>
              <Skeleton width={200} height={22} />
              <MatrixSkeleton />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              <div
                className="px-row"
                style={{ justifyContent: "space-between" }}
              >
                <h2 className="px-section">
                  {people.find((p) => p.username === username)?.name ??
                    username}
                </h2>
                <Button
                  variant="primary"
                  disabled={!dirty || isSuper}
                  busy={saving}
                  onClick={() =>
                    saveUserPermissions(
                      username,
                      isSuper,
                      setSaving,
                      perms,
                      role,
                      setDirty,
                      setAlert,
                      setPerms,
                      setOriginal,
                    )
                  }
                >
                  Save Permissions
                </Button>
              </div>
              <div className="px-row" style={{ gap: 24 }}>
                <label className={inlineCheckClass}>
                  <Switch
                    checked={isSuper}
                    onChange={setSuper}
                    label="Superuser"
                  />
                  Superuser — can do everything
                </label>
                <Field label="Apply a role">
                  <Select
                    value={role ? String(role._id ?? role.id ?? role.name) : ""}
                    disabled={isSuper}
                    onChange={(e) => selectRole(e.target.value)}
                  >
                    <option value="">None</option>
                    {roleList.map((r) => (
                      <option
                        key={String(r._id ?? r.id ?? r.name)}
                        value={String(r._id ?? r.id ?? r.name)}
                      >
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {isSuper && (
                <Banner tone="warning">
                  Superusers have every permission; individual permissions don’t
                  apply.
                </Banner>
              )}
              <PermissionMatrix
                has={(p) => isSuper || perms.includes(p)}
                disabled={isSuper}
                toggle={(m, a, sc) =>
                  togglePermission(
                    m,
                    a,
                    sc,
                    isSuper,
                    perms,
                    setPerms,
                    setDirty,
                    original,
                  )
                }
              />
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

// ── Teams ───────────────────────────────────────────────────────────────────

export function TeamsPage() {
  const { setAlert } = useContext(AlertContext);
  const teams = useGet<any>("/get-teams");
  const { people } = usePeople();
  const byId = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, p])),
    [people],
  );
  const [selected, setSelected] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [removing, setRemoving] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const list = asList<any>(teams.data, "teams");
  useEffect(() => {
    if (selected) setSelected(list.find((t) => t._id === selected._id) ?? null);
  }, [teams.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (
    fn: () => Promise<unknown>,
    ok: string,
    after?: () => void,
  ) => {
    setBusy(true);
    try {
      await fn();
      setAlert({ open: true, message: ok, severity: "success" });
      after?.();
      teams.refetch();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };
  const nameOf = (m: any) =>
    m?.name || m?.fullName || byId[m?.id]?.name || m?.username || "Unknown";
  const columns: Column<any>[] = [
    {
      key: "team",
      header: "Team",
      priority: "primary",
      render: (t) => (
        <PrimaryCell
          title={t.teamName}
          subtitle={
            t.teamLeaderId
              ? `Led by ${nameOf(byId[t.teamLeaderId] ?? { id: t.teamLeaderId })}`
              : undefined
          }
        />
      ),
    },
    {
      key: "n",
      header: "Members",
      align: "right",
      priority: "trailing",
      width: 200,
      // Faces of the first few members, then the count, so team size is
      // visible at a glance (same pattern as Roles).
      render: (t) => {
        const members: any[] = t.membersInfo ?? [];
        if (!members.length)
          return <span className="px-meta px-tertiary">No members</span>;
        return (
          <span
            className="px-row"
            style={{ flexWrap: "nowrap", gap: 6, justifyContent: "flex-end" }}
          >
            <span className={s.stack}>
              {members.slice(0, 4).map((m, i) => (
                <Avatar key={m?.id ?? i} name={nameOf(m)} size={22} />
              ))}
            </span>
            <span className="px-meta px-num">{members.length}</span>
          </span>
        );
      },
    },
  ];
  return (
    <Page
      title="Teams"
      description="Groups of people with a team leader. Leaders see their team’s attendance and requests on Today."
      actions={
        <Button
          data-tour="teams-new"
          variant="primary"
          icon="plus"
          onClick={() => setCreating(true)}
        >
          New Team
        </Button>
      }
      inspector={
        <Inspector
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title={selected?.teamName ?? "Team"}
          id={selected?._id}
          footer={
            selected && (
              <>
                <Button
                  variant="tintedDanger"
                  onClick={() => setDeleting(selected)}
                >
                  Delete Team
                </Button>
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Add Members
                </Button>
              </>
            )
          }
        >
          {selected && (
            <ul className="px-hairline-list">
              {(selected.membersInfo ?? []).map((m: any) => (
                <li
                  key={m.id}
                  className="px-row"
                  style={{ flexWrap: "nowrap", padding: "8px 0" }}
                >
                  <Avatar name={nameOf(m)} src={m.imageURL} size={28} />
                  <span style={{ flex: 1, display: "grid" }}>
                    <span>{nameOf(m)}</span>
                    {m.id === selected.teamLeaderId && (
                      <span className="px-meta">Team lead</span>
                    )}
                  </span>
                  {m.id !== selected.teamLeaderId && (
                    <Button
                      size="small"
                      variant="plain"
                      onClick={() => setRemoving(m)}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Inspector>
      }
    >
      <DataTable
        label="Teams"
        tour="teams-table"
        columns={columns}
        rows={list}
        rowId={(t) => String(t._id)}
        loading={teams.loading}
        onRowClick={setSelected}
        selectedId={selected?._id ?? null}
        empty={{
          icon: "org",
          title: "No teams yet",
          body: "Teams set reporting lines: leads approve their members’ requests and appear in the org chart.",
        }}
      />
      <TeamDialog
        open={creating}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          teams.refetch();
        }}
      />
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        size="lg"
        title={`Add to ${selected?.teamName ?? "Team"}`}
        footer={<Button onClick={() => setAdding(false)}>Done</Button>}
      >
        <AddMembers
          existing={(selected?.membersInfo ?? []).map((m: any) => String(m.id))}
          busy={busy}
          onAdd={(ids) =>
            run(
              () =>
                apiClient.put(API_ENDPOINTS.ADD_TEAM_MEMBERS, {
                  members: ids,
                  teamId: selected._id,
                }),
              "Members added.",
              () => setAdding(false),
            )
          }
        />
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        busy={busy}
        title={`Delete ${deleting?.teamName}?`}
        description="Members keep their accounts; they just leave this team."
        confirmLabel="Delete Team"
        onConfirm={() =>
          run(
            () => apiClient.delete(API_ENDPOINTS.DELETE_TEAM(deleting._id)),
            "Team deleted.",
            () => {
              setDeleting(null);
              setSelected(null);
            },
          )
        }
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        busy={busy}
        title={`Remove ${nameOf(removing)}?`}
        confirmLabel="Remove"
        onConfirm={() =>
          run(
            () =>
              apiClient.post(API_ENDPOINTS.DELETE_USER_FROM_TEAM, {
                userId: removing.id,
                teamId: selected._id,
              }),
            "Removed from team.",
            () => setRemoving(null),
          )
        }
      />
    </Page>
  );
}

function AddMembers({
  existing,
  busy,
  onAdd,
}: {
  existing: string[];
  busy: boolean;
  onAdd: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const fresh = ids.filter((i) => !existing.includes(i));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <PeoplePicker value={ids} onChange={setIds} />
      <div className="px-row" style={{ justifyContent: "flex-end" }}>
        <Button
          variant="primary"
          disabled={!fresh.length}
          busy={busy}
          onClick={() => onAdd(fresh)}
        >
          Add {fresh.length || ""} {fresh.length === 1 ? "Person" : "People"}
        </Button>
      </div>
    </div>
  );
}

function TeamDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [name, setName] = useState("");
  const [lead, setLead] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setLead("");
      setMembers([]);
      setErrors({});
    }
  }, [open]);
  const submit = async () => {
    const n: Record<string, string> = {};
    if (!name.trim()) n.name = "Name the team.";
    if (!lead) n.lead = "Choose a team lead.";
    setErrors(n);
    if (Object.keys(n).length) return;
    setSaving(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.CREATE_TEAM, {
        team_name: name.trim(),
        members: members.filter((m) => m !== lead),
        teamLeaderId: lead,
      });
      setAlert({
        open: true,
        message: res.data?.message || "Team created.",
        severity: "success",
      });
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
      size="lg"
      title="New Team"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={saving} onClick={submit}>
            Create Team
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <Field label="Name" error={errors.name}>
          <TextInput
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Platform"
          />
        </Field>
        <Field
          label="Team Lead"
          error={errors.lead}
          hint="Leads approve their members’ requests."
        >
          <UserCombobox value={lead} onChange={(id) => setLead(id)} />
        </Field>
        <Field label="Members" optional>
          <PeoplePicker value={members} onChange={setMembers} height={200} />
        </Field>
      </div>
    </Dialog>
  );
}
