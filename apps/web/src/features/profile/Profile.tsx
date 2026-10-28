import { useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { generateDeviceFingerprint } from "@web/shared/utils/pushNotifications/deviceFingerprint";
import { generateToken } from "@web/shared/utils/pushNotifications/generateFcmToken";
import { upsertFcmTokenInUser } from "@web/shared/utils/pushNotifications/upsertFcmTokenInUser";
import { sharedName, Swap, vtName } from "@next/motion";
import {
  Button,
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
import { fmtDate, fmtDateTime, fromNow } from "@next/lib/format";
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
          idPrefix="profile"
          value={section}
          onChange={(v) => navigate(`/profile/${v}`, { replace: true })}
          segments={[...SECTIONS]}
        />
      }
    >
      <EmployeeIdentity
        person={user}
        style={sharedName(vtName("employee", user?.username ?? "me"))}
      />
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
      <div className={s.columns}>
        {[0, 1].map((i) => (
          <div key={i} style={{ display: "grid", gap: 12 }}>
            <Skeleton width={90} height={17} />
            <KeyValuesSkeleton rows={5} />
          </div>
        ))}
      </div>
    );
  return (
    <div className={s.columns}>
      <Section title="Work">
        <KeyValues
          items={[
            ["Username", p?.username],
            ["Work Email", p?.official_email || user?.email],
            ["Department", p?.department],
            ["Designation", p?.designation],
            ["Joined", fmtDate(p?.joining_date)],
            ["Organisation", user?.tenantName],
            ["PF Number", p?.pf_no],
            ["UAN", p?.uan_no],
          ]}
        />
      </Section>
      <Section title="Personal">
        <KeyValues
          items={[
            ["Personal Email", p?.email || p?.personalEmail],
            ["Phone", p?.mobile],
            ["Date of Birth", fmtDate(p?.dob)],
            ["Blood Group", p?.blood_group],
            [
              "Address",
              [
                p?.communication_address_line_1,
                p?.communication_address_city,
                p?.communication_address_state,
              ]
                .filter(Boolean)
                .join(", ") || null,
            ],
            [
              "Bank",
              [
                p?.bank_name,
                p?.bank_account_no
                  ? `•••• ${String(p.bank_account_no).slice(-4)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || null,
            ],
          ]}
        />
        <p className="px-meta">
          To change these, update your KYC from{" "}
          <a href={`/view-kyc/${encodeURIComponent(user?.username ?? "")}`}>
            KYC
          </a>
          .
        </p>
      </Section>
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
  const tokens: any[] = user?.fcmTokens ?? [];

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
    setBusy(true);
    try {
      const token = await generateToken(setAlert);
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

  return (
    <Section
      title="Devices Receiving Notifications"
      action={
        <div className="px-row">
          {tokens.length > 1 && (
            <Button variant="plain" onClick={() => setRemove("all")}>
              Turn Off Everywhere
            </Button>
          )}
          {!enabledHere && (
            <Button variant="primary" busy={busy} onClick={enable}>
              Turn On for This Device
            </Button>
          )}
        </div>
      }
    >
      {tokens.length === 0 ? (
        <EmptyState icon="bell" title="No devices yet">
          Turn on notifications to hear about approvals, announcements, and
          requests even when Praesto isn’t open.
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
