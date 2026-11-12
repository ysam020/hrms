import {
  startTransition,
  useContext,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { deleteNotificationsFromDB, saveNotification } from "@web/core/db";
import { StaggerItem, StaggerList } from "@next/motion";
import { Button, EmptyState, IconButton, Popover, Skeleton } from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { fromNow } from "@next/lib/format";
import s from "./shell.module.css";

/** Same-app path, or nothing (never an absolute or protocol-relative URL). */
function appPath(link: unknown): string | null {
  return typeof link === "string" &&
    link.startsWith("/") &&
    !link.startsWith("//")
    ? link
    : null;
}

/**
 * Toolbar bell + popover over the shared notification stream.
 *
 * Read and cleared are separate: opening a notification marks it read (it
 * stays listed, without the unread dot); clearing removes it for good. The
 * badge counts unread ones.
 */
export function NotificationsButton() {
  const ctx = useContext(NotificationContext) as any;
  const { setAlert } = useContext(AlertContext);
  const navigate = useNavigate();
  const notifications: any[] = ctx?.notifications ?? [];
  const loading: boolean = ctx?.loading ?? false;
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  // Cleared notifications disappear at once. The shared list only loses them
  // once the gateway confirms; until then they are hidden by an optimistic
  // layer that React drops when the request settles, so a failed clear
  // brings back exactly what it hid, without undoing a newer clear or
  // swallowing a notification that arrived meanwhile.
  const [shown, hide] = useOptimistic(
    notifications,
    (list: any[], ids: Set<string>) => list.filter((n) => !ids.has(n._id)),
  );
  const unread = shown.filter((n) => !n.isRead);

  const clear = (ids: Set<string>, request: () => Promise<unknown>) =>
    startTransition(async () => {
      hide(ids);
      try {
        await request();
        deleteNotificationsFromDB([...ids]).catch(() => undefined);
        startTransition(() =>
          ctx.setNotifications((list: any[]) =>
            list.filter((n) => !ids.has(n._id)),
          ),
        );
      } catch (err) {
        setAlert({ open: true, message: errorMessage(err), severity: "error" });
      }
    });
  const clearOne = (id: string) =>
    clear(new Set([id]), () =>
      apiClient.put(API_ENDPOINTS.CLEAR_NOTIFICATION(id)),
    );
  // Clears what is on screen now; one that arrives during the request stays.
  const clearAll = () =>
    clear(new Set(shown.map((n) => n._id)), () =>
      apiClient.put(API_ENDPOINTS.CLEAR_ALL_NOTIFICATIONS),
    );

  // Marks read locally at once (the dot and the badge update immediately)
  // and puts it back to unread if the gateway refuses.
  const setRead = (ids: Set<string>, isRead: boolean) =>
    ctx.setNotifications((list: any[]) =>
      list.map((n) => {
        if (!ids.has(n._id)) return n;
        const next = {
          ...n,
          isRead,
          readAt: isRead ? new Date().toISOString() : "",
        };
        saveNotification(next).catch(() => undefined);
        return next;
      }),
    );
  const markRead = async (
    ids: Set<string>,
    request: () => Promise<unknown>,
  ) => {
    if (ids.size === 0) return;
    setRead(ids, true);
    try {
      await request();
    } catch (err) {
      // A gateway without read state yet (the web app ships on merge, the
      // backend separately) answers 404: keep it read for this session
      // rather than flagging an error the person can't act on.
      if ((err as any)?.response?.status === 404) return;
      setRead(ids, false);
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };
  const readAll = () =>
    markRead(new Set(unread.map((n) => n._id)), () =>
      apiClient.put(API_ENDPOINTS.READ_ALL_NOTIFICATIONS),
    );

  const openItem = (n: any) => {
    if (!n.isRead) {
      void markRead(new Set([n._id]), () =>
        apiClient.put(API_ENDPOINTS.READ_NOTIFICATION(n._id)),
      );
    }
    const path = appPath(n.link);
    if (path) {
      setOpen(false);
      navigate(path);
    }
  };

  return (
    <>
      <IconButton
        ref={anchor}
        icon="bell"
        // IconButton announces the badge itself ("…, 2 new").
        label="Notifications"
        badge={unread.length}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-tour="notifications"
      />
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchor}
        label="Notifications"
        placement="bottom-end"
        width={360}
      >
        <div className={s.notifHead}>
          <h2 className="px-headline" style={{ flex: 1 }}>
            Notifications
          </h2>
          {unread.length > 0 && (
            <Button size="small" variant="plain" onClick={readAll}>
              Mark All Read
            </Button>
          )}
          {shown.length > 0 && (
            <Button size="small" variant="plain" onClick={clearAll}>
              Clear All
            </Button>
          )}
        </div>
        {loading && shown.length === 0 ? (
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            <Skeleton width="70%" />
            <Skeleton width="90%" />
            <Skeleton width="50%" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon="bell" title="You’re all caught up">
            New requests, approvals, and announcements will appear here.
          </EmptyState>
        ) : (
          <StaggerList>
            {shown.slice(0, 50).map((n, i) => (
              <StaggerItem
                key={n._id}
                index={i}
                className={s.notifItem}
                data-unread={n.isRead ? undefined : ""}
              >
                <button
                  type="button"
                  className={s.notifOpen}
                  onClick={() => openItem(n)}
                  aria-label={
                    n.isRead ? undefined : `Unread: ${n.title}. ${n.message}`
                  }
                >
                  <span className={s.notifTitle}>
                    {!n.isRead && (
                      <span className={s.notifDot} aria-hidden="true" />
                    )}
                    {n.title}
                  </span>
                  <span className={s.notifBody}>{n.message}</span>
                  <span className={s.notifTime}>
                    {fromNow(n.timeStamp || n.createdAt)}
                  </span>
                </button>
                <IconButton
                  className={s.notifClear}
                  icon="x"
                  label={`Clear “${n.title}”`}
                  onClick={() => clearOne(n._id)}
                />
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </Popover>
    </>
  );
}
