import { AnimatePresence, motion } from "framer-motion";
import { useContext, useEffect } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { preset } from "@next/motion";
import { Icon, type IconName } from "./Icon";
import s from "./overlays.module.css";
import { IconButton } from "./controls";

// Renders Classic's AlertContext ({ open, message, severity }) — so every
// reused hook that calls setAlert() shows feedback here unchanged. Timing
// matches Classic: errors 6s, warnings 5s, others 3s.

const ICON: Record<string, IconName> = {
  success: "checkCircle",
  error: "alert",
  warning: "alert",
  info: "info",
};
const TONE: Record<string, string> = {
  success: "success",
  error: "danger",
  warning: "warning",
  info: "accent",
};

export function ToastHost() {
  const { alert, setAlert } = useContext(AlertContext) as any;

  useEffect(() => {
    if (!alert?.open) return;
    const ms =
      alert.severity === "error"
        ? 6000
        : alert.severity === "warning"
          ? 5000
          : 3000;
    const t = setTimeout(
      () => setAlert((a: any) => ({ ...a, open: false })),
      ms,
    );
    return () => clearTimeout(t);
  }, [alert, setAlert]);

  const tone = TONE[alert?.severity] ?? "accent";
  return (
    <div
      role="status"
      aria-live={alert?.severity === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      style={{
        position: "fixed",
        zIndex: "var(--px-z-toast)" as any,
        left: 0,
        right: 0,
        bottom: "calc(var(--px-space-6) + env(safe-area-inset-bottom))",
        display: "grid",
        justifyItems: "center",
        pointerEvents: "none",
        padding: "0 16px",
      }}
    >
      <AnimatePresence mode="popLayout">
        {alert?.open && (
          <motion.div
            key={alert.message}
            variants={preset("rise")}
            initial="initial"
            animate="animate"
            exit="exit"
            className={s.toast}
          >
            <span
              className={s.toastIcon}
              style={{ color: `var(--px-${tone})` }}
            >
              <Icon name={ICON[alert.severity] ?? "info"} size={18} />
            </span>
            <span className={s.toastText}>{alert.message}</span>
            <IconButton
              icon="x"
              label="Dismiss"
              onClick={() => setAlert((a: any) => ({ ...a, open: false }))}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
