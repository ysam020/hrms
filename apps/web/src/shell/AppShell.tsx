import { motion } from "framer-motion";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { SocketProvider } from "@web/app/providers/SocketContext";
import { ChatUnreadProvider } from "@web/app/providers/ChatUnreadContext";
import {
  ApprovalsBadgeContext,
  ApprovalsBadgeProvider,
} from "@web/app/providers/ApprovalsBadgeContext";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import useNotifications from "@web/shared/hooks/useNotifications";
import { TransitionLink, duration, ease } from "@next/motion";
import { Icon, IconButton, Sheet } from "@next/ui";
import { useIsCompact, useIsRegular } from "@next/lib/hooks";
import { TAB_BAR, activeItem } from "@next/app/navigation";
import { ShellContext } from "./context";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { NotificationsButton } from "./Notifications";
import { OfflineStatusButton } from "@next/offline";
import { WalkthroughProvider } from "@next/walkthrough/WalkthroughProvider";
import { applyAppearance } from "./appearance";
import s from "./shell.module.css";

const HIDDEN_KEY = "px-sidebar-hidden";

/** Signed-in chrome. Providers are Classic's own (socket, chat unread, approvals, notifications). */
export function AppShell() {
  return (
    <SocketProvider>
      <ChatUnreadProvider>
        <ApprovalsBadgeProvider>
          <NotificationsBridge>
            <ShellLayout />
          </NotificationsBridge>
        </ApprovalsBadgeProvider>
      </ChatUnreadProvider>
    </SocketProvider>
  );
}

function NotificationsBridge({ children }: { children: React.ReactNode }) {
  const { notifications, setNotifications, loading, setLoading } =
    useNotifications();
  const value = useMemo(
    () => ({ notifications, setNotifications, loading, setLoading }),
    [notifications, setNotifications, loading, setLoading],
  );
  return (
    <NotificationContext.Provider value={value as any}>
      {children}
    </NotificationContext.Provider>
  );
}

function ShellLayout() {
  const docked = useIsRegular();
  const compact = useIsCompact();
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => applyAppearance(), []);

  const toggleSidebar = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(HIDDEN_KEY, h ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !h;
    });

  // Close the navigation sheet whenever the route changes.
  useEffect(() => setNavOpen(false), [pathname]);

  // Move focus to the new page's heading after navigation (screen readers
  // and keyboard users land on the content, not the old link).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const h1 = document.querySelector<HTMLElement>("#px-main h1");
    if (h1) {
      h1.tabIndex = -1;
      h1.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        if (docked) toggleSidebar();
        else setNavOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docked]);

  const sidebarHidden = docked && hidden;
  const shellValue = useMemo(
    () => ({
      docked,
      sidebarHidden,
      toggleSidebar,
      openNavigation: () => setNavOpen(true),
      toolbarExtras: (
        <>
          {!docked && (
            <IconButton
              icon="search"
              label="Search"
              onClick={() => setSearchOpen(true)}
              data-tour="toolbar-search"
            />
          )}
          <OfflineStatusButton />
          <NotificationsButton />
        </>
      ),
    }),
    [docked, sidebarHidden],
  );

  return (
    <ShellContext.Provider value={shellValue}>
      <WalkthroughProvider>
        <a href="#px-main" className="px-skip">
          Skip to Content
        </a>
        <div className={s.shell}>
          {docked && (
            <motion.aside
              className={s.sidebarDock}
              initial={false}
              animate={{
                width: sidebarHidden ? 0 : 256,
                opacity: sidebarHidden ? 0 : 1,
              }}
              transition={{ duration: duration.base, ease: ease.standard }}
              aria-label="Sidebar"
              {...(sidebarHidden ? ({ inert: "" } as object) : {})}
            >
              <Sidebar
                onSearch={() => setSearchOpen(true)}
                onHide={toggleSidebar}
              />
            </motion.aside>
          )}
          <main
            id="px-main"
            className={s.content}
            data-sidebar-hidden={sidebarHidden || undefined}
          >
            <Outlet />
          </main>
        </div>

        {!docked && (
          <Sheet
            open={navOpen}
            onClose={() => setNavOpen(false)}
            edge="left"
            width={300}
            label="Navigation"
          >
            <Sidebar
              onNavigate={() => setNavOpen(false)}
              onSearch={() => setSearchOpen(true)}
            />
          </Sheet>
        )}
        {compact && <TabBar onMore={() => setNavOpen(true)} />}
        <CommandPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
        />
      </WalkthroughProvider>
    </ShellContext.Provider>
  );
}

function TabBar({ onMore }: { onMore: () => void }) {
  const { pathname } = useLocation();
  const { pendingApprovalsCount } = useContext(ApprovalsBadgeContext);
  const current = activeItem(pathname);
  const items = TAB_BAR;
  const inTabs = items.some((i) => i.id === current?.id);
  return (
    <nav className={s.tabbar} aria-label="Tabs">
      {items.map((i) => (
        <TransitionLink
          key={i.id}
          to={i.path}
          className={s.tab}
          aria-current={i.id === current?.id ? "page" : undefined}
        >
          <Icon name={i.icon} />
          {i.label}
          {i.id === "approvals" && pendingApprovalsCount > 0 && (
            <span
              className={s.tabBadge}
              aria-label={`${pendingApprovalsCount} pending`}
            >
              {pendingApprovalsCount}
            </span>
          )}
        </TransitionLink>
      ))}
      <button
        type="button"
        className={s.tab}
        onClick={onMore}
        aria-current={!inTabs ? "page" : undefined}
      >
        <Icon name="more" />
        More
      </button>
    </nav>
  );
}
