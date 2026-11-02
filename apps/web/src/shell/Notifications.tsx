import {
  startTransition,
  useContext,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { StaggerItem, StaggerList } from "@next/motion";
import { Button, EmptyState, IconButton, Popover, Skeleton } from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { fromNow } from "@next/lib/format";
import s from "./shell.module.css";

/** Toolbar bell + popover over Classic's shared notification stream. */
export function NotificationsButton() {
  const ctx = useContext(NotificationContext) as any;
  const { setAlert } = useContext(AlertContext);
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
  const clear = (ids: Set<string>, request: () => Promise<unknown>) =>
    startTransition(async () => {
      hide(ids);
      try {
        await request();
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

  return (
    <>
      <IconButton
        ref={anchor}
        icon="bell"
        label="Notifications"
        badge={shown.length}
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
              <StaggerItem key={n._id} index={i} className={s.notifItem}>
                <span className={s.notifTitle}>{n.title}</span>
                <span className={s.notifBody}>{n.message}</span>
                <span className={s.notifTime}>
                  {fromNow(n.timeStamp || n.createdAt)}
                </span>
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
