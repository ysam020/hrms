import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { getAccessToken } from "@web/core/http/axiosConfig";
import { scopeFromToken } from "@next/offline/state";
import { apiClient, asList, isCanceled } from "@next/lib/api";
import { personName } from "@next/lib/format";
import { Presence } from "@next/motion";
import { Avatar } from "./display";
import { Icon } from "./Icon";
import { Portal } from "./layers";
import { Spinner } from "./Spinner";
import type { Person } from "./PeoplePicker";
import f from "./fields.module.css";
import s from "./UserCombobox.module.css";

const LIMIT = 8;
const DEBOUNCE_MS = 200;

// Remote results per tenant + person + query, for this tab: retyping a
// query (or reopening the field) doesn't hit the server again. Keying by the
// token's scope means switching organisation (or signing in as someone
// else) never shows another tenant's names.
const remoteCache = new Map<string, Person[]>();
const cacheKey = (q: string) =>
  `${scopeFromToken(getAccessToken()) ?? "anon"}|${q}`;

const toPerson = (u: any): Person => ({
  id: String(u.id),
  username: u.username,
  name: personName({
    ...u,
    first_name: u.first_name ?? u.firstName,
    last_name: u.last_name ?? u.lastName,
  }),
  // Only what identifies someone: no email, phone or other personal fields.
  detail: u.designation || u.department || undefined,
  photo: u.employee_photo ?? u.employeePhoto ?? null,
});

const matches = (p: Person, q: string) =>
  `${p.name} ${p.username ?? ""} ${p.detail ?? ""}`.toLowerCase().includes(q);

/**
 * Pick one person by typing a name or username. Suggestions come from the
 * organisation's directory (GET /get-all-users?search=, tenant-scoped on the
 * server), or from `options` when the field only accepts a known subset
 * (e.g. people allowed to interview).
 *
 * The value is whichever identifier the workflow submits (`valueKey`), never
 * the displayed text. Editing the text after choosing clears the value, so a
 * half-typed name can't be submitted as if it were a selection.
 */
export function UserCombobox({
  value,
  onChange,
  valueKey = "id",
  options,
  selected: selectedProp,
  placeholder = "Search by name or username",
  label,
  disabled,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "data-autofocus": dataAutofocus,
}: {
  value: string;
  onChange: (value: string, person: Person | null) => void;
  /** Which identifier the form submits. */
  valueKey?: "id" | "username";
  /** A fixed list to choose from (filtered here) instead of the directory. */
  options?: Person[];
  /** The chosen person, when the value was set before this field mounted. */
  selected?: Person | null;
  placeholder?: string;
  /** Accessible name when the field has no visible <label>. */
  label?: string;
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "data-autofocus"?: boolean;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const keyOf = useCallback(
    (p: Person) => (valueKey === "username" ? (p.username ?? "") : p.id),
    [valueKey],
  );

  const [chosen, setChosen] = useState<Person | null>(selectedProp ?? null);
  const [text, setText] = useState(selectedProp?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);

  // Keep the field in step when the parent sets or resets the value (e.g. a
  // form reset after saving, or the initial value arriving later).
  useEffect(() => {
    if (!value) {
      if (chosen) {
        setChosen(null);
        setText("");
      }
      return;
    }
    if (chosen && keyOf(chosen) === value) return;
    const known =
      selectedProp && keyOf(selectedProp) === value
        ? selectedProp
        : options?.find((p) => keyOf(p) === value);
    if (known) {
      setChosen(known);
      setText(known.name);
    }
  }, [value, selectedProp, options]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = chosen && text === chosen.name ? "" : text.trim();
  const q = query.toLowerCase();

  // Remote search: debounced, abortable, and only the latest response wins.
  const seq = useRef(0);
  useEffect(() => {
    if (options || !open) return;
    const key = q;
    const hit = remoteCache.get(cacheKey(key));
    if (hit) {
      setRemote(hit);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    const controller = new AbortController();
    setLoading(true);
    const t = window.setTimeout(
      () => {
        apiClient
          .get(API_ENDPOINTS.GET_ALL_USERS(LIMIT), {
            params: key ? { search: key } : undefined,
            signal: controller.signal,
          })
          .then((res) => {
            const list = asList<any>(res.data?.data ?? res.data, "users").map(
              toPerson,
            );
            remoteCache.set(cacheKey(key), list);
            if (mine === seq.current) setRemote(list);
          })
          .catch((err) => {
            if (!isCanceled(err) && mine === seq.current) setRemote([]);
          })
          .finally(() => {
            if (mine === seq.current) setLoading(false);
          });
      },
      key ? DEBOUNCE_MS : 0,
    );
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [q, open, options]);

  const suggestions = useMemo(() => {
    const list = options ? options.filter((p) => !q || matches(p, q)) : remote;
    // De-duplicate by the submitted identifier.
    const seen = new Set<string>();
    return list
      .filter((p) => {
        const k = keyOf(p);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, options ? 50 : LIMIT);
  }, [options, remote, q, keyOf]);

  useEffect(() => {
    setActive(suggestions.length ? 0 : -1);
  }, [suggestions]);

  const choose = (p: Person) => {
    setChosen(p);
    setText(p.name);
    setOpen(false);
    onChange(keyOf(p), p);
  };

  const onType = (next: string) => {
    setText(next);
    setOpen(true);
    if (chosen) {
      setChosen(null);
      onChange("", null);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (!suggestions.length) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + dir + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      if (open && active >= 0 && suggestions[active]) {
        e.preventDefault();
        choose(suggestions[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        // Close the list only; a surrounding dialog stays open.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  // Position the list under the field. It's portalled so dialogs and
  // scrolling containers can't clip it, so follow the field on scroll.
  const [pos, setPos] = useState<CSSProperties>({});
  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < 220 && r.top > below;
    // At least wide enough for a name and its detail, kept on screen.
    const width = Math.min(Math.max(r.width, 260), window.innerWidth - 16);
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      minWidth: 0,
      maxHeight: Math.max(160, (up ? r.top : below) - 16),
      ...(up
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
    });
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const activeId =
    open && active >= 0 && suggestions[active]
      ? `${listId}-${active}`
      : undefined;

  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  return (
    <div className={s.wrap}>
      <Icon name="search" className={f.searchIcon} size={15} />
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        data-autofocus={dataAutofocus || undefined}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
        disabled={disabled}
        className={`${f.control} ${s.input}`}
        value={text}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        // Choosing with the pointer keeps focus here (see onMouseDown below),
        // so a blur means the person moved on.
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <Portal>
        <Presence
          show={open && !disabled}
          variant="pop"
          className={s.popover}
          style={pos}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label={label ?? "Suggestions"}
            className={s.list}
            // Keep focus in the field while the pointer picks an option.
            onMouseDown={(e) => e.preventDefault()}
          >
            {suggestions.map((p, i) => (
              <li
                key={keyOf(p)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={s.option}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
              >
                <Avatar name={p.name} src={p.photo} size={24} />
                <span className={s.text}>
                  <span className="px-label px-truncate">{p.name}</span>
                  <span className="px-meta px-truncate">
                    {[p.username, p.detail].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            ))}
            {loading && suggestions.length === 0 && (
              <li className={s.status} role="presentation">
                <Spinner label="Searching…" size="small" showLabel />
              </li>
            )}
            {!loading && suggestions.length === 0 && (
              <li className={s.status} role="presentation">
                {query ? `No one matches “${query}”.` : "No people to show."}
              </li>
            )}
          </ul>
        </Presence>
      </Portal>
    </div>
  );
}
