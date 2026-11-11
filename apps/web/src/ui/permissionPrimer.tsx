import { useCallback, useRef, useState, type ReactNode } from "react";
import { Dialog } from "./overlays";
import { Button } from "./controls";
import type { IconName } from "./Icon";

// Browsers ask for a permission with a bare system prompt that says nothing
// about why. Before triggering one, explain what it's for; if the person has
// blocked it, say how to turn it back on (the browser won't ask again).
//
//   const { ask, primer } = usePermissionPrimer();
//   if (!(await ask("camera"))) return;   // then call getUserMedia etc.
//   …render {primer} somewhere in the component.

export type PermissionKind = "camera" | "geolocation" | "notifications";
export type PermissionState = "granted" | "denied" | "prompt" | "unsupported";

export async function permissionState(
  kind: PermissionKind,
): Promise<PermissionState> {
  if (typeof window === "undefined") return "unsupported";
  if (kind === "notifications") {
    if (!("Notification" in window)) return "unsupported";
    const p = Notification.permission;
    return p === "default" ? "prompt" : p;
  }
  if (kind === "geolocation" && !navigator.geolocation) return "unsupported";
  if (kind === "camera" && !navigator.mediaDevices?.getUserMedia)
    return "unsupported";
  try {
    const s = await navigator.permissions.query({
      name: kind as PermissionName,
    });
    return s.state;
  } catch {
    // Some browsers (Safari, Firefox for camera) can't query it; asking is
    // the only way to find out, so explain first.
    return "prompt";
  }
}

export interface PrimerCopy {
  title: string;
  /** Why we need it, in one or two sentences. */
  reason: string;
  /** What the person should know before they decide. */
  points?: string[];
  allowLabel?: string;
}

const NAMES: Record<PermissionKind, string> = {
  camera: "Camera",
  geolocation: "Location",
  notifications: "Notifications",
};

const ICONS: Record<PermissionKind, IconName> = {
  camera: "person",
  geolocation: "pin",
  notifications: "bell",
};

export const DEFAULT_COPY: Record<PermissionKind, PrimerCopy> = {
  camera: {
    title: "Allow Camera for Face Check",
    reason:
      "Praesto uses your camera for a quick face check when you punch in or out, so nobody else can mark attendance for you.",
    points: [
      "The camera is on only during the check.",
      "Your face is compared on this device; the video isn’t uploaded or stored.",
    ],
    allowLabel: "Continue",
  },
  geolocation: {
    title: "Share Your Location",
    reason:
      "Your organisation records where attendance is marked from, to confirm you’re at an allowed workplace.",
    points: [
      "Location is read once, when you punch in or out.",
      "Praesto doesn’t track you in the background.",
    ],
    allowLabel: "Continue",
  },
  notifications: {
    title: "Turn On Notifications",
    reason:
      "Get alerts for approvals, leave decisions, announcements and messages, even when Praesto isn’t open.",
    points: [
      "Only work updates are sent; never marketing.",
      "You can turn them off anytime in Profile.",
    ],
    allowLabel: "Continue",
  },
};

const isAppleMobile = () =>
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod/.test(navigator.userAgent);

function unblockSteps(kind: PermissionKind): string[] {
  const name = NAMES[kind];
  if (isAppleMobile()) {
    return kind === "notifications"
      ? [
          "Open the Settings app and find Praesto (or Safari, if you use it in the browser).",
          "Turn on Allow Notifications, then come back here.",
        ]
      : [
          `Open the Settings app → Safari (or Praesto, if installed) → ${name}.`,
          "Choose Ask or Allow, then reload this page.",
        ];
  }
  return [
    "Click the site settings icon at the left of the address bar.",
    `Set ${name} to Allow.`,
    "Reload the page and try again.",
  ];
}

type Pending = {
  kind: PermissionKind;
  mode: "explain" | "blocked";
  copy: PrimerCopy;
  resolve: (ok: boolean) => void;
};

export function usePermissionPrimer(): {
  ask: (kind: PermissionKind, copy?: Partial<PrimerCopy>) => Promise<boolean>;
  primer: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const ref = useRef<Pending | null>(null);

  const settle = useCallback((ok: boolean) => {
    const p = ref.current;
    ref.current = null;
    setPending(null);
    p?.resolve(ok);
  }, []);

  const ask = useCallback(
    async (kind: PermissionKind, copy?: Partial<PrimerCopy>) => {
      const state = await permissionState(kind);
      if (state === "granted") return true;
      if (state === "unsupported") return false;
      ref.current?.resolve(false);
      return new Promise<boolean>((resolve) => {
        const p: Pending = {
          kind,
          mode: state === "denied" ? "blocked" : "explain",
          copy: { ...DEFAULT_COPY[kind], ...copy },
          resolve,
        };
        ref.current = p;
        setPending(p);
      });
    },
    [],
  );

  const recheck = useCallback(async () => {
    const p = ref.current;
    if (!p) return;
    const state = await permissionState(p.kind);
    if (state === "granted") settle(true);
    else if (state === "prompt") {
      const next = { ...p, mode: "explain" as const };
      ref.current = next;
      setPending(next);
    }
  }, [settle]);

  const p = pending;
  const primer = (
    <Dialog
      open={!!p}
      onClose={() => settle(false)}
      size="sm"
      icon={
        p
          ? {
              name: ICONS[p.kind],
              tone: p.mode === "blocked" ? "warning" : "accent",
            }
          : undefined
      }
      title={
        p?.mode === "blocked"
          ? `${p ? NAMES[p.kind] : ""} Is Blocked`
          : (p?.copy.title ?? "")
      }
      description={
        p?.mode === "blocked"
          ? `Your browser is blocking ${NAMES[p.kind].toLowerCase()} access for Praesto. ${p.copy.reason}`
          : p?.copy.reason
      }
      footer={
        p?.mode === "blocked" ? (
          <>
            <Button onClick={() => settle(false)}>Close</Button>
            <Button variant="primary" onClick={recheck}>
              I’ve Allowed It
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => settle(false)}>Not Now</Button>
            <Button
              variant="primary"
              onClick={() => settle(true)}
              data-autofocus
            >
              {p?.copy.allowLabel ?? "Continue"}
            </Button>
          </>
        )
      }
    >
      {p && (
        <div style={{ display: "grid", gap: 10 }}>
          {p.mode === "blocked" ? (
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
              {unblockSteps(p.kind).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          ) : (
            <>
              {!!p.copy.points?.length && (
                <ul
                  className="px-secondary"
                  style={{
                    margin: 0,
                    paddingLeft: 20,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  {p.copy.points.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
              <p className="px-tertiary" style={{ margin: 0 }}>
                Next, your browser will ask you to confirm.
              </p>
            </>
          )}
        </div>
      )}
    </Dialog>
  );

  return { ask, primer };
}
