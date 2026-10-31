import { useContext, useRef, useState } from "react";
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

  const clearOne = async (id: string) => {
    const prev = notifications;
    ctx.setNotifications(prev.filter((n) => n._id !== id));
    try {
      await apiClient.put(API_ENDPOINTS.CLEAR_NOTIFICATION(id));
    } catch (err) {
      ctx.setNotifications(prev);
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };
  const clearAll = async () => {
    const prev = notifications;
    ctx.setNotifications([]);
    try {
      await apiClient.put(API_ENDPOINTS.CLEAR_ALL_NOTIFICATIONS);
    } catch (err) {
      ctx.setNotifications(prev);
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };

  return (
    <>
      <IconButton
        ref={anchor}
        icon="bell"
        label="Notifications"
        badge={notifications.length}
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
          {notifications.length > 0 && (
            <Button size="small" variant="plain" onClick={clearAll}>
              Clear All
            </Button>
          )}
        </div>
        {loading && notifications.length === 0 ? (
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            <Skeleton width="70%" />
            <Skeleton width="90%" />
            <Skeleton width="50%" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState icon="bell" title="You’re all caught up">
            New requests, approvals, and announcements will appear here.
          </EmptyState>
        ) : (
          <StaggerList>
            {notifications.slice(0, 50).map((n, i) => (
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
