import { AnimatePresence, motion } from "framer-motion";
import {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import {
  ExitGuard,
  preset,
  scrimVariants,
  useTransitionNavigate,
} from "@next/motion";
import {
  Avatar,
  Icon,
  Portal,
  useDismissStack,
  useFocusTrap,
  useScrollLock,
  type IconName,
} from "@next/ui";
import { searchableNav } from "@next/app/navigation";
import { apiClient, asList, unwrap } from "@next/lib/api";
import { personName } from "@next/lib/format";
import s from "./shell.module.css";

interface Result {
  id: string;
  group: "Go To" | "People";
  label: string;
  meta?: string;
  icon?: IconName;
  person?: any;
  run: () => void;
}

const score = (text: string, q: string) => {
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 3;
  if (t.split(/\s+/).some((w) => w.startsWith(q))) return 2;
  return t.includes(q) ? 1 : 0;
};

/** ⌘K: jump to any destination you can access, or to a person. */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useContext(UserContext);
  const navigate = useTransitionNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<any[] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useScrollLock(open);
  useDismissStack(open, onClose);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      return;
    }
    // People search is limited to roles that can open employee records.
    if (people === null && isHrOrAbove(user)) {
      apiClient
        .get(API_ENDPOINTS.GET_ALL_USERS(500))
        .then((res) => setPeople(asList(unwrap(res), "users")))
        .catch(() => setPeople([]));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const go = (path: string) => () => {
      onClose();
      navigate(path);
    };
    const nav = searchableNav(user)
      .map((i) => ({
        i,
        sc: q
          ? Math.max(
              score(i.label, q),
              i.keywords ? score(i.keywords, q) - 1 : 0,
            )
          : 1,
      }))
      .filter((x) => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .map<Result>(({ i }) => ({
        id: `nav-${i.id}`,
        group: "Go To",
        label: i.label,
        icon: i.icon,
        meta: i.module,
        run: go(i.path),
      }));
    const ppl =
      q.length >= 2 && people
        ? people
            .map((p) => ({
              p,
              sc: Math.max(
                score(personName(p), q),
                score(p.username || "", q),
                score(p.email || "", q),
              ),
            }))
            .filter((x) => x.sc > 0)
            .sort((a, b) => b.sc - a.sc)
            .slice(0, 8)
            .map<Result>(({ p }) => ({
              id: `p-${p.id ?? p.username}`,
              group: "People",
              label: personName(p),
              meta: p.designation || p.department || p.username,
              person: p,
              run: go(`/employee-management/${encodeURIComponent(p.username)}`),
            }))
        : [];
    return [...nav.slice(0, q ? 8 : 12), ...ppl];
  }, [query, people, user, navigate, onClose]);

  useEffect(() => setActive(0), [query]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = results.length;
      if (!n) return;
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    }
  };

  useEffect(() => {
    document
      .getElementById(`${listId}-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  let lastGroup = "";
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div
            key="palette"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: "var(--px-z-dialog)" as any,
            }}
          >
            <motion.div
              variants={scrimVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{
                position: "absolute",
                inset: 0,
                background: "var(--px-bg-scrim)",
              }}
              onClick={onClose}
              aria-hidden
            />
            <ExitGuard
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Search Praesto"
              className={s.palette}
              variants={preset("pop")}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className={s.paletteInput}>
                <Icon name="search" />
                <input
                  data-autofocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Search pages and people"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={
                    results[active] ? `${listId}-${active}` : undefined
                  }
                  aria-autocomplete="list"
                />
              </div>
              <div
                className={s.paletteList}
                id={listId}
                role="listbox"
                aria-label="Results"
              >
                {results.length === 0 ? (
                  <p className={s.paletteEmpty}>
                    No pages or people match “{query}”.
                  </p>
                ) : (
                  results.map((r, i) => {
                    const heading = r.group !== lastGroup ? r.group : null;
                    lastGroup = r.group;
                    return (
                      <div key={r.id}>
                        {heading && (
                          <div className={s.paletteHeading} role="presentation">
                            {heading}
                          </div>
                        )}
                        <div
                          id={`${listId}-${i}`}
                          role="option"
                          aria-selected={i === active}
                          className={s.paletteItem}
                          onMouseMove={() => setActive(i)}
                          onClick={r.run}
                        >
                          {r.person ? (
                            <Avatar
                              name={r.label}
                              src={r.person.employee_photo}
                              size={24}
                            />
                          ) : (
                            r.icon && <Icon name={r.icon} />
                          )}
                          <span>{r.label}</span>
                          {r.meta && (
                            <span className={s.paletteMeta}>{r.meta}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ExitGuard>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
