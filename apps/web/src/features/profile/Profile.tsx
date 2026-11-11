import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { generateDeviceFingerprint } from "@web/shared/utils/pushNotifications/deviceFingerprint";
import { generateToken } from "@web/shared/utils/pushNotifications/generateFcmToken";
import { upsertFcmTokenInUser } from "@web/shared/utils/pushNotifications/upsertFcmTokenInUser";
import { Swap } from "@next/motion";
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Group,
  Icon,
  KeyValues,
  Page,
  Section,
  SegmentedControl,
  Skeleton,
  KeyValuesSkeleton,
  ListSkeleton,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { MyStatusButton } from "@next/features/presence/StatusPicker";
import { fmtDate, fmtDateTime, fromNow, readableCase } from "@next/lib/format";
import type { IconName } from "@next/ui/Icon";
import { usePermissionPrimer } from "@next/ui/permissionPrimer";
import { EmployeeIdentity } from "../employees/EmployeeIdentity";
import s from "./profile.module.css";

// My profile — Classic's three profile tabs as sections of one page:
//   /profile/basic-info          details (GET /get-employee-details/:me)
//   /profile/push-notifications  devices receiving push (Classic's FCM helpers)
//   /profile/security-keys       passkeys (Classic's core/webauthn helpers)
// Classic's Spotlight also listed devices/2FA/backup-codes/reset-password
// paths; those tabs no longer exist there, so they redirect here.

const SECTIONS = [
  { value: "basic-info", label: "Details" },
  { value: "push-notifications", label: "Notifications" },
  { value: "security-keys", label: "Passkeys" },
] as const;
type Sec = (typeof SECTIONS)[number]["value"];

export default function Profile() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const slug = pathname.split("/")[2] ?? "";
  if (!SECTIONS.some((x) => x.value === slug)) {
    return (
      <Navigate
        to={
          slug === "logged-in-devices"
            ? "/profile/security-keys"
            : "/profile/basic-info"
        }
        replace
      />
    );
  }
  const section = slug as Sec;
  return (
    <Page
      title="My Profile"
      largeTitle
      width="wide"
      tabs={
        <SegmentedControl
          label="Profile sections"
          tour="profile-sections"
          idPrefix="profile"
          value={section}
          onChange={(v) => navigate(`/profile/${v}`, { replace: true })}
          segments={[...SECTIONS]}
        />
      }
    >
      {/* Named, so it stays still while the sections below cross-fade. */}
      <Card className={s.hero}>
        <EmployeeIdentity
          person={user}
          sharedKey={user?.username ?? "me"}
          size={72}
        />
        <dl className={s.facts}>
          <Fact label="Joined" value={fmtDate(user?.joining_date)}>
            {tenure(user?.joining_date)}
          </Fact>
          <Fact label="Username" value={user?.username} />
          <Fact label="Department" value={readableCase(user?.department)} />
          <Fact label="Organisation" value={user?.tenantName} />
        </dl>
        <MyStatusButton className={s.heroStatus} />
      </Card>
      <Swap
        id={section}
        elementProps={{
          role: "tabpanel",
          id: `profile-panel-${section}`,
          "aria-labelledby": `profile-tab-${section}`,
        }}
      >
        {section === "basic-info" && <Details />}
        {section === "push-notifications" && <PushDevices />}
        {section === "security-keys" && <Passkeys />}
      </Swap>
    </Page>
  );
}

function Fact({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: string | null;
}) {
  return (
    <div className={s.fact}>
      <dt>{label}</dt>
      <dd>
        {value && value !== "—" ? (
          value
        ) : (
          <span className="px-tertiary">—</span>
        )}
        {children && <span className={s.factNote}>{children}</span>}
      </dd>
    </div>
  );
}

/** "5 yrs 10 mos" since `from`, or null when unknown. */
function tenure(from?: string | null) {
  const start = from ? dayjs(from) : null;
  if (!start?.isValid() || start.isAfter(dayjs())) return null;
  const months = dayjs().diff(start, "month");
  const y = Math.floor(months / 12);
  const m = months % 12;
  const part = (n: number, one: string) =>
    n ? `${n} ${one}${n > 1 ? "s" : ""}` : "";
  return [part(y, "yr"), part(m, "mo")].filter(Boolean).join(" ") || "New";
}

/** A titled card of label/value rows. */
function InfoCard({
  icon,
  title,
  items,
  footer,
}: {
  icon: IconName;
  title: string;
  items: [string, React.ReactNode][];
  footer?: React.ReactNode;
}) {
  return (
    <Card as="section" className={s.infoCard} aria-label={title}>
      <h2 className={s.infoTitle}>
        <span className={s.icon} aria-hidden>
          <Icon name={icon} />
        </span>
        {title}
      </h2>
      <KeyValues items={items} />
      {footer}
    </Card>
  );
}

const date = (v?: string | null) =>
  v && dayjs(v).isValid() ? fmtDate(v) : null;

function Details() {
  const { user } = useContext(UserContext);
  const me = useGet<any>(
    user?.username
      ? `/get-employee-details/${encodeURIComponent(user.username)}`
      : null,
  );
  const p = me.data && !me.data.message ? { ...user, ...me.data } : user;
  if (me.loading && !me.data)
    return (
      <div className={s.cards}>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <div style={{ display: "grid", gap: 12 }}>
              <Skeleton width={110} height={17} />
              <KeyValuesSkeleton rows={4} />
            </div>
          </Card>
        ))}
      </div>
    );
  const address = (kind: "communication" | "permanent") =>
    [
      p?.[`${kind}_address_line_1`],
      p?.[`${kind}_address_line_2`],
      p?.[`${kind}_address_city`],
      [p?.[`${kind}_address_state`], p?.[`${kind}_address_pincode`]]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(", ") || null;
  const last4 = (v?: string | null) =>
    v ? `•••• ${String(v).slice(-4)}` : null;
  return (
    <div className={s.cards}>
      <InfoCard
        icon="briefcase"
        title="Work"
        items={[
          ["Designation", readableCase(p?.designation) || null],
          ["Department", readableCase(p?.department) || null],
          ["Joined", date(p?.joining_date)],
          ["Organisation", user?.tenantName],
        ]}
      />
      <InfoCard
        icon="chat"
        title="Contact"
        items={[
          ["Work Email", p?.official_email || user?.email],
          ["Personal Email", p?.personalEmail || p?.email],
          ["Phone", p?.mobile],
          ["Address", address("communication")],
        ]}
      />
      <InfoCard
        icon="heart"
        title="Personal"
        items={[
          ["Date of Birth", date(p?.dob)],
          ["Blood Group", p?.blood_group],
          [
            "Permanent Address",
            address("permanent") &&
            address("permanent") === address("communication")
              ? "Same as current address"
              : address("permanent"),
          ],
        ]}
      />
      <InfoCard
        icon="bank"
        title="Bank & Statutory"
        items={[
          [
            "Bank",
            [p?.bank_name, last4(p?.bank_account_no)]
              .filter(Boolean)
              .join(" · ") || null,
          ],
          ["IFSC", p?.ifsc_code],
          ["PF Number", p?.pf_no],
          ["UAN", p?.uan_no],
        ]}
        footer={
          <p className={`px-meta ${s.cardNote}`}>
            <Icon name="lock" size={12} /> Personal and bank details come from
            your KYC.{" "}
            <Link to={`/view-kyc/${encodeURIComponent(user?.username ?? "")}`}>
              Update KYC
            </Link>
          </p>
        }
      />
    </div>
  );
}

// ── Push notifications (Classic's PushNotifications tab) ───────────────────

function PushDevices() {
  const { user, setUser } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<any | "all" | null>(null);
  const { ask, primer } = usePermissionPrimer();
  // Why turning on failed, kept on the page (a toast is gone too soon for
  // steps like Brave's push setting).
  const [problem, setProblem] = useState<string | null>(null);
  const tokens: any[] = user?.fcmTokens ?? [];
  const supported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
  const permission = supported ? Notification.permission : "default";

  useEffect(() => {
    generateDeviceFingerprint()
      .then((r: any) => setMine(r.deviceFingerprint))
      .catch(() => {});
    apiClient
      .get(API_ENDPOINTS.GET_PROFILE)
      .then(
        (res) =>
          res.data?.success &&
          setUser((prev: any) => ({ ...prev, ...res.data.data.user })),
      )
      .catch(() => {});
  }, [setUser]);

  const enabledHere = tokens.some((t) => t.deviceFingerprint === mine);
  const enable = async () => {
    setProblem(null);
    // Say why before the browser's prompt (or how to unblock it).
    if (!(await ask("notifications"))) return;
    setBusy(true);
    try {
      const token = await generateToken((a: any) => {
        if (a?.severity === "error" || a?.severity === "warning")
          setProblem(a.message);
        else setAlert(a);
      });
      if (token) {
        const { deviceFingerprint, deviceInfo } =
          await generateDeviceFingerprint();
        setUser((prev: any) =>
          upsertFcmTokenInUser(prev, token, deviceFingerprint, deviceInfo),
        );
        setAlert({
          open: true,
          message: "Push notifications are on for this device.",
          severity: "success",
        });
      }
    } catch {
      setAlert({
        open: true,
        message:
          "Push notifications couldn’t be turned on. Check the browser’s notification permission.",
        severity: "error",
      });
    } finally {
      setBusy(false);
    }
  };
  const confirmRemove = async () => {
    setBusy(true);
    try {
      if (remove === "all") {
        const { disablePushNotifications } =
          await import("@web/shared/utils/pushNotifications/disablePushNotifications");
        await disablePushNotifications(setAlert, true);
        setUser((prev: any) => ({ ...prev, fcmTokens: [] }));
      } else if (remove) {
        const res = await apiClient.delete(
          API_ENDPOINTS.DISABLE_PUSH_NOTIFICATIONS,
          { data: { deviceFingerprint: remove.deviceFingerprint } },
        );
        setAlert({
          open: true,
          message: res.data?.message || "Device removed.",
          severity: "success",
        });
        setUser((prev: any) => ({
          ...prev,
          fcmTokens: (prev.fcmTokens || []).filter(
            (t: any) => t.deviceFingerprint !== remove.deviceFingerprint,
          ),
        }));
      }
      setRemove(null);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };
  const name = (t: any) =>
    [t.deviceInfo?.browser, t.deviceInfo?.os].filter(Boolean).join(" on ") ||
    "Unknown device";

  const here: {
    tone: "success" | "neutral" | "warning";
    title: string;
    text: string;
  } = !supported
    ? {
        tone: "warning",
        title: "Not supported here",
        text: "This browser can’t receive push notifications. You’ll still see them in Praesto’s bell.",
      }
    : enabledHere
      ? {
          tone: "success",
          title: "On for this device",
          text: "Approvals, announcements and requests reach you even when Praesto isn’t open.",
        }
      : permission === "denied"
        ? {
            tone: "warning",
            title: "Blocked by the browser",
            text: "Notifications are blocked for this site. Allow them in the browser’s site settings, then turn them on here.",
          }
        : {
            tone: "neutral",
            title: "Off for this device",
            text: "Turn on notifications to hear about approvals, announcements and requests even when Praesto isn’t open.",
          };

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <Card className={s.deviceCard} data-tone={here.tone}>
        <span className={s.deviceIcon} aria-hidden>
          <Icon name={enabledHere ? "checkCircle" : "bell"} />
        </span>
        <div className={s.text}>
          <span className="px-headline">{here.title}</span>
          <span className="px-meta">{here.text}</span>
        </div>
        {supported && !enabledHere && (
          <Button
            variant={permission === "denied" ? "secondary" : "primary"}
            icon="bell"
            busy={busy}
            onClick={enable}
          >
            {permission === "denied" ? "How to Allow" : "Turn On"}
          </Button>
        )}
      </Card>
      {primer}
      {problem && (
        <Banner
          tone="danger"
          title="Notifications couldn’t be turned on"
          action={
            <Button
              size="small"
              variant="plain"
              onClick={() => setProblem(null)}
            >
              Dismiss
            </Button>
          }
        >
          {problem}
        </Banner>
      )}
      <Section
        title="Devices Receiving Notifications"
        action={
          <div className="px-row">
            {tokens.length > 1 && (
              <Button variant="plain" onClick={() => setRemove("all")}>
                Turn Off Everywhere
              </Button>
            )}
          </div>
        }
      >
        {tokens.length === 0 ? (
          <EmptyState icon="device" title="No devices yet">
            Devices you turn notifications on for appear here, so you can remove
            ones you no longer use.
          </EmptyState>
        ) : (
          <Group>
            <ul>
              {tokens.map((t) => (
                <li key={t.deviceFingerprint} className={s.row}>
                  <span className={s.icon}>
                    <Icon
                      name={
                        t.deviceInfo?.deviceType === "mobile"
                          ? "device"
                          : "laptop"
                      }
                    />
                  </span>
                  <span className={s.text}>
                    <span className="px-headline">
                      {name(t)}
                      {t.deviceFingerprint === mine && (
                        <span className="px-meta"> · This device</span>
                      )}
                    </span>
                    <span className="px-meta">
                      {t.lastUsed
                        ? `Last used ${fromNow(t.lastUsed)}`
                        : "Registered"}
                    </span>
                  </span>
                  <Button
                    size="small"
                    variant="plain"
                    onClick={() => setRemove(t)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </Group>
        )}
        <ConfirmDialog
          open={Boolean(remove)}
          onClose={() => setRemove(null)}
          onConfirm={confirmRemove}
          busy={busy}
          title={
            remove === "all"
              ? "Turn Off Notifications Everywhere?"
              : "Remove This Device?"
          }
          description={
            remove === "all"
              ? "No device will receive push notifications until you turn them on again."
              : remove
                ? `${name(remove)} stops receiving notifications.`
                : undefined
          }
          confirmLabel={remove === "all" ? "Turn Off" : "Remove"}
        />
      </Section>
    </div>
  );
}

// ── Passkeys (Classic's WebAuthnDevices tab) ───────────────────────────────

function Passkeys() {
  const { setAlert } = useContext(AlertContext);
  const [creds, setCreds] = useState<any[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<any | "all" | null>(null);

  const load = useCallback(async () => {
    try {
      const { getCurrentDeviceCredentialId } =
        await import("@web/core/webauthn");
      setCurrent(getCurrentDeviceCredentialId());
      const res = await apiClient.get(API_ENDPOINTS.WEBAUTHN_CREDENTIALS);
      setCreds(res.data?.data?.credentials ?? []);
    } catch (err) {
      setCreds([]);
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  }, [setAlert]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      const { initiateWebauthnRegistration } =
        await import("@web/core/webauthn");
      await initiateWebauthnRegistration(setAlert as any);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const confirmRemove = async () => {
    setBusy(true);
    try {
      const w = await import("@web/core/webauthn");
      if (remove === "all") await w.disableAllWebAuthn(setAlert as any);
      else if (remove)
        await w.disableWebAuthnCredential(remove.credentialID, setAlert as any);
      setRemove(null);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const label = (c: any) =>
    [c.deviceInfo?.browser, c.deviceInfo?.os].filter(Boolean).join(" on ") ||
    "Passkey";

  return (
    <Section
      title="Passkeys"
      detail="Sign in with Touch ID, Face ID, Windows Hello, or a security key"
      action={
        <div className="px-row">
          {(creds?.length ?? 0) > 1 && (
            <Button variant="plain" onClick={() => setRemove("all")}>
              Remove All
            </Button>
          )}
          <Button variant="primary" icon="key" busy={busy} onClick={add}>
            Add a Passkey
          </Button>
        </div>
      }
    >
      {creds === null ? (
        <ListSkeleton rows={2} trailing />
      ) : creds.length === 0 ? (
        <EmptyState icon="key" title="No passkeys yet">
          A passkey lets you sign in from this device without a password.
        </EmptyState>
      ) : (
        <Group>
          <ul>
            {creds.map((c) => (
              <li key={c.credentialID} className={s.row}>
                <span className={s.icon}>
                  <Icon name="key" />
                </span>
                <span className={s.text}>
                  <span className="px-headline">
                    {label(c)}
                    {c.credentialID === current && (
                      <span className="px-meta"> · This device</span>
                    )}
                  </span>
                  <span className="px-meta">
                    Added {fmtDateTime(c.createdAt)}
                  </span>
                </span>
                <Button
                  size="small"
                  variant="plain"
                  onClick={() => setRemove(c)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Group>
      )}
      <ConfirmDialog
        open={Boolean(remove)}
        onClose={() => setRemove(null)}
        onConfirm={confirmRemove}
        busy={busy}
        title={remove === "all" ? "Remove All Passkeys?" : "Remove Passkey?"}
        description={
          remove === "all"
            ? "You’ll need Google sign-in until you add a passkey again."
            : remove
              ? `${label(remove)} can no longer sign in to Praesto.`
              : undefined
        }
        confirmLabel="Remove"
      />
    </Section>
  );
}
