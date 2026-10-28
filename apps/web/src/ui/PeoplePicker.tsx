import { useEffect, useMemo, useState } from "react";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { apiClient, asList } from "@next/lib/api";
import { personName } from "@next/lib/format";
import { Checkbox } from "./controls";
import { Avatar } from "./display";
import { SearchField } from "./fields";

export interface Person {
  id: string;
  username?: string;
  name: string;
  detail?: string;
  photo?: string | null;
}

let cache: Person[] | null = null;

/** Everyone in the organisation (GET /get-all-users), cached per session. */
export function usePeople() {
  const [people, setPeople] = useState<Person[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    if (cache) return;
    apiClient
      .get(API_ENDPOINTS.GET_ALL_USERS(1000))
      .then((res) => {
        cache = asList<any>(res.data?.data ?? res.data, "users").map((u) => ({
          id: String(u.id),
          username: u.username,
          name: personName({
            ...u,
            first_name: u.first_name ?? u.firstName,
            last_name: u.last_name ?? u.lastName,
          }),
          detail: u.designation || u.department || u.username,
          photo: u.employee_photo,
        }));
        setPeople(cache);
      })
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  }, []);
  return { people, loading };
}

/** Searchable, checkable list of people. Selected people stay on top. */
export function PeoplePicker({
  value,
  onChange,
  label = "Search people",
  height = 260,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  height?: number;
}) {
  const { people, loading } = usePeople();
  const [q, setQ] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people
      .filter(
        (p) =>
          !t ||
          `${p.name} ${p.username ?? ""} ${p.detail ?? ""}`
            .toLowerCase()
            .includes(t),
      )
      .sort(
        (a, b) =>
          Number(selected.has(b.id)) - Number(selected.has(a.id)) ||
          a.name.localeCompare(b.name),
      );
  }, [people, q, selected]);
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="px-row" style={{ justifyContent: "space-between" }}>
        <SearchField
          label={label}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1 }}
        />
        <span className="px-meta px-num">{value.length} selected</span>
      </div>
      <ul
        role="listbox"
        aria-multiselectable="true"
        aria-label={label}
        style={{
          maxHeight: height,
          overflowY: "auto",
          borderRadius: "var(--px-radius-md)",
          boxShadow: "inset 0 0 0 1px var(--px-separator)",
        }}
      >
        {loading && (
          <li className="px-meta" style={{ padding: 12 }}>
            Loading people…
          </li>
        )}
        {shown.map((p) => (
          <li key={p.id} role="option" aria-selected={selected.has(p.id)}>
            <label
              className="px-row"
              style={{
                flexWrap: "nowrap",
                gap: 10,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              <Checkbox
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                aria-label={p.name}
              />
              <Avatar name={p.name} src={p.photo} size={24} />
              <span style={{ display: "grid", minWidth: 0 }}>
                <span className="px-label px-truncate">{p.name}</span>
                {p.detail && (
                  <span className="px-meta px-truncate">{p.detail}</span>
                )}
              </span>
            </label>
          </li>
        ))}
        {!loading && shown.length === 0 && (
          <li className="px-meta" style={{ padding: 12 }}>
            No one matches “{q}”.
          </li>
        )}
      </ul>
    </div>
  );
}
