import { LayoutGroup, motion } from "framer-motion";
import { useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { ChatUnreadContext } from "@web/app/providers/ChatUnreadContext";
import { ApprovalsBadgeContext } from "@web/app/providers/ApprovalsBadgeContext";
import {
  Collapse,
  TransitionNavLink,
  duration,
  ease,
  useTransitionNavigate,
} from "@next/motion";
import {
  Icon,
  IconButton,
  Menu,
  type IconName,
  type MenuEntry,
} from "@next/ui";
import { activeEntry, visibleNav, type NavModule } from "@next/app/navigation";
import { personName } from "@next/lib/format";
import { useAppearance } from "./appearance";
import { useWalkthrough } from "@next/walkthrough/WalkthroughProvider";
import s from "./shell.module.css";

export function Sidebar({
  onNavigate,
  onSearch,
  onHide,
}: {
  /** Called after a link is chosen (closes the sheet on narrow widths). */
  onNavigate?: () => void;
  onSearch: () => void;
  onHide?: () => void;
}) {
  const { user, handleLogout } = useContext(UserContext);
  const { pendingApprovalsCount } = useContext(ApprovalsBadgeContext);
  const { totalUnread } = useContext(ChatUnreadContext);
  const { pathname } = useLocation();
  const active = activeEntry(pathname);
  const clusters = visibleNav(user);
  // One group open at a time (an accordion): it follows the current module,
  // so moving to another module collapses the one you left.
  const activeModuleId = active.module?.id ?? null;
  const [open, setOpen] = useState<string | null>(activeModuleId);
  useEffect(() => setOpen(activeModuleId), [activeModuleId]);
  const { appearance, setAppearance } = useAppearance();
  const navigate = useTransitionNavigate();
  const accountRef = useRef<HTMLButtonElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const walkthrough = useWalkthrough();
  const pausedTour =
    walkthrough?.ready && walkthrough.state.active
      ? walkthrough.state.tours[walkthrough.state.active]?.status === "paused"
        ? walkthrough.state.active
        : null
      : null;

  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  const accountItems: MenuEntry[] = [
    { heading: user?.email || personName(user) },
    {
      label: "My Profile",
      icon: "person",
      onSelect: () => {
        navigate("/profile");
        onNavigate?.();
      },
    },
    pausedTour
      ? {
          label: "Resume Tour",
          icon: "play",
          onSelect: () => {
            void walkthrough!.start(pausedTour);
            onNavigate?.();
          },
        }
      : {
          label: "Product Tours",
          icon: "sparkle",
          onSelect: () => {
            navigate("/help/tours");
            onNavigate?.();
          },
        },
    { separator: true },
    { heading: "Appearance" },
    ...(["system", "light", "dark"] as const).map((a) => ({
      label: a === "system" ? "Match System" : a === "light" ? "Light" : "Dark",
      icon: (a === "dark"
        ? "moon"
        : a === "light"
          ? "sun"
          : "device") as "moon",
      meta: appearance === a ? "✓" : undefined,
      onSelect: () => setAppearance(a),
    })),
    { separator: true },
    { label: "Log Out…", icon: "logout", meta: "⇧⌘L", onSelect: handleLogout },
  ];

  return (
    <div className={s.sidebar} data-px-sidebar="">
      <div className={s.sidebarHead}>
        <button
          ref={accountRef}
          type="button"
          className={s.orgButton}
          data-tour="sidebar-account"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((v) => !v)}
        >
          <span className={s.orgMark} aria-hidden>
            {(user?.tenantName || "P").slice(0, 1).toUpperCase()}
          </span>
          <span className={s.orgText}>
            <span className={s.orgName}>{user?.tenantName || "Praesto"}</span>
            <span className={s.orgUser}>{personName(user)}</span>
          </span>
        </button>
        {onHide && (
          <IconButton icon="sidebar" label="Hide Sidebar" onClick={onHide} />
        )}
      </div>
      <Menu
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        anchorRef={accountRef}
        items={accountItems}
        label="Account"
        placement="bottom-start"
      />

      <button
        type="button"
        className={s.searchButton}
        onClick={onSearch}
        data-tour="sidebar-search"
      >
        <Icon name="search" size={15} />
        Search
        <kbd aria-hidden>⌘K</kbd>
      </button>

      <nav className={s.nav} aria-label="Primary" data-tour="sidebar-nav">
        <LayoutGroup id="sidebar">
          {clusters.map((cluster, ci) => (
            <ul key={ci} className={s.cluster}>
              {cluster.map((m) => (
                <li key={m.id} data-tour={`nav-${m.id}`}>
                  {m.pages ? (
                    <ModuleGroup
                      module={m}
                      activePageId={active.page?.id}
                      expanded={open === m.id}
                      onToggle={() => toggle(m.id)}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    <NavLinkRow
                      to={m.path!}
                      exact={m.exact}
                      icon={m.icon}
                      label={m.label}
                      active={active.module?.id === m.id && !active.page}
                      count={
                        m.id === "approvals"
                          ? pendingApprovalsCount
                          : m.id === "chat"
                            ? totalUnread
                            : undefined
                      }
                      onNavigate={onNavigate}
                    />
                  )}
                </li>
              ))}
            </ul>
          ))}
        </LayoutGroup>
      </nav>
    </div>
  );
}

function Indicator() {
  return (
    <motion.span
      layoutId="nav-indicator"
      className={s.indicator}
      transition={{ duration: duration.base, ease: ease.standard }}
    />
  );
}

function NavLinkRow({
  to,
  exact,
  icon,
  label,
  active,
  count,
  nested,
  onNavigate,
}: {
  to: string;
  exact?: boolean;
  icon?: IconName;
  label: string;
  active: boolean;
  count?: number;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <TransitionNavLink
      to={to}
      end={exact}
      className={nested ? `${s.item} ${s.subItem}` : s.item}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      {active && <Indicator />}
      {icon && <Icon name={icon} />}
      <span className={s.itemLabel}>{label}</span>
      {!!count && (
        <span className={s.count} aria-label={`${count} pending`}>
          {count}
        </span>
      )}
    </TransitionNavLink>
  );
}

/** A module with several pages: a disclosure row and its pages beneath. */
function ModuleGroup({
  module: m,
  activePageId,
  expanded,
  onToggle,
  onNavigate,
}: {
  module: NavModule;
  activePageId?: string;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const listId = `nav-${m.id}`;
  const containsActive = m.pages!.some((p) => p.id === activePageId);
  return (
    <>
      <button
        type="button"
        className={s.item}
        data-parent-active={containsActive || undefined}
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={onToggle}
      >
        <Icon name={m.icon} />
        <span className={s.itemLabel}>{m.label}</span>
        <Icon name="chevronRight" className={s.disclosure} size={12} />
      </button>
      <Collapse open={expanded} id={listId}>
        <ul className={s.subList}>
          {m.pages!.map((p) => (
            <li key={p.id}>
              <NavLinkRow
                to={p.path}
                exact={p.exact}
                label={p.label}
                active={p.id === activePageId}
                nested
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </Collapse>
    </>
  );
}
