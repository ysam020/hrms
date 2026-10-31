import r from "./review.module.css";
import { useCallback, useContext, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { ApprovalsBadgeContext } from "@web/app/providers/ApprovalsBadgeContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import useSocketEvent from "@web/shared/hooks/useSocketEvent";
import { Collapse, TransitionLink } from "@next/motion";
import {
  FormSection,
  Avatar,
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  FileLink,
  KeyValues,
  Page,
  Section,
  Skeleton,
  Status,
  TextArea,
  TextInput,
  inlineCheckClass,
  HeaderSkeleton,
  KeyValuesSkeleton,
  type IconName,
  type Tone,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { fmtDate, personName, readableCase } from "@next/lib/format";
import { ALL_KYC_FIELDS, KYC_GROUPS, KYC_LABEL, UNEDITABLE } from "./fields";

// One person's KYC (Classic's ViewIndividualKyc): GET /get-user-data/:username,
// approve / request revision (POST /kyc-approval), request an update
// (POST /request-kyc-edit-access), allow editing (PUT /allow-kyc-edit).
// Permission checks and status rules are Classic's.

const mask = (v: string) => (v.length > 4 ? `•••• ${v.slice(-4)}` : v);

const GROUP_ICON: Record<string, { icon: IconName; tone: Tone }> = {
  Personal: { icon: "person", tone: "accent" },
  "Permanent Address": { icon: "pin", tone: "accent" },
  "Communication Address": { icon: "wfh", tone: "accent" },
  "Identity Documents": { icon: "idcard", tone: "warning" },
  "Education & Experience": { icon: "graduation", tone: "success" },
  Bank: { icon: "bank", tone: "success" },
};
const isEmpty = (v: unknown) =>
  v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");

export default function KycReview() {
  const { username = "" } = useParams();
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const { refetchPendingApprovals } = useContext(ApprovalsBadgeContext);
  const { data, loading, refetch } = useGet<any>(
    `/get-user-data/${encodeURIComponent(username)}`,
  );
  const perm = (a: string) =>
    hasPermission(
      "BasicKYCDetails",
      a,
      "all",
      user?.isSuperUser,
      user?.permissions || [],
    );
  const [dialog, setDialog] = useState<null | "approve" | "revise" | "request">(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [revealed, setRevealed] = useState(false);

  // Live updates while an edit request is in flight (as in Classic).
  const onSocket = useCallback(
    (p: { username?: string }) => p?.username === username && refetch(),
    [username, refetch],
  );
  useSocketEvent("kyc-edit-requested", onSocket);
  useSocketEvent("kyc-edit-allowed", onSocket);
  useSocketEvent("kyc-edit-resolved", onSocket);

  const k = data && !data.message ? data : null;
  const required = ALL_KYC_FIELDS.filter((f) => !f.optional);
  const filled = k ? required.filter((f) => !isEmpty(k[f.key])).length : 0;
  const status: string | undefined = k?.kyc_approval;
  const isSelf = user?.username === username;
  const uneditable = UNEDITABLE.includes(status ?? "");
  const editBlocked =
    uneditable || (status === "Pending" && k?.kyc_edit_window === "closed");
  const notes: Record<string, string> = k?.kyc_revision_notes ?? {};

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      const res = await fn();
      setAlert({
        open: true,
        message: res.data?.message || "Done.",
        severity: "success",
      });
      setDialog(null);
      setIssues({});
      setReason("");
      refetch();
      refetchPendingApprovals();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const value = (key: string) => {
    const f = ALL_KYC_FIELDS.find((x) => x.key === key)!;
    const v = k?.[key];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null;
    if (f.kind === "file")
      return <FileLink url={String(v)} label="View document" />;
    if (f.kind === "files")
      return (
        <span style={{ display: "grid", gap: 4 }}>
          {(v as string[]).map((u, i) => (
            <FileLink key={u} url={u} label={`Document ${i + 1}`} />
          ))}
        </span>
      );
    if (f.kind === "date") return fmtDate(v);
    return f.mask && !revealed ? (
      <span className="px-num">{mask(String(v))}</span>
    ) : (
      String(v)
    );
  };

  return (
    <Page
      title={k ? personName(k) : "KYC"}
      subtitle="KYC details"
      back={{ to: "/kyc/view-employee-kycs", label: "Employee KYC" }}
      width="wide"
      actions={
        k && (
          <>
            {!isSelf &&
              k.employeeStatus !== "Inactive" &&
              perm("request_kyc_revision") &&
              !uneditable && (
                <Button
                  variant="tintedDanger"
                  icon="refresh"
                  onClick={() => setDialog("revise")}
                >
                  Request Revision
                </Button>
              )}
            {!isSelf && perm("approve_kyc") && !uneditable && (
              <Button
                variant="primary"
                icon="checkCircle"
                onClick={() => setDialog("approve")}
              >
                Approve KYC
              </Button>
            )}
            {isSelf && status === "Approved" && (
              <Button icon="edit" onClick={() => setDialog("request")}>
                Request KYC Update
              </Button>
            )}
            {perm("edit_kyc") &&
              !editBlocked &&
              (!isSelf || user?.isSuperUser) && (
                <TransitionLink
                  to={`/edit-kyc/${encodeURIComponent(username)}`}
                >
                  <Button icon="edit">Edit</Button>
                </TransitionLink>
              )}
          </>
        )
      }
    >
      {loading && !k ? (
        <div style={{ display: "grid", gap: 32 }}>
          <HeaderSkeleton />
          <KeyValuesSkeleton rows={10} />
        </div>
      ) : !k ? (
        <EmptyState icon="idcard" title="No KYC record found" />
      ) : (
        <div style={{ display: "grid", gap: 32 }}>
          <div className={r.hero}>
            <Avatar name={personName(k)} size={56} />
            <div className={r.heroText}>
              <span className="px-title">{readableCase(personName(k))}</span>
              <span className="px-row" style={{ gap: 8 }}>
                <Status value={status || "Not Submitted"} />
                <span className="px-meta">
                  {filled} of {required.length} required details provided
                </span>
              </span>
              <span className={r.meter} aria-hidden>
                <span
                  style={{
                    width: `${required.length ? (filled / required.length) * 100 : 0}%`,
                  }}
                />
              </span>
            </div>
          </div>
          {status === "Revision Requested" && Object.keys(notes).length > 0 && (
            <Banner tone="danger">
              Revision requested:{" "}
              {Object.entries(notes)
                .map(([f, n]) => `${KYC_LABEL[f] ?? f} — ${n}`)
                .join("; ")}
            </Banner>
          )}
          {status === "Edit Requested" && (
            <Banner tone="warning">
              <b>
                {isSelf
                  ? "Your edit request is waiting for approval."
                  : "This employee asked to update their KYC."}
              </b>
              {k.kyc_edit_request_reason && (
                <span> Reason: “{k.kyc_edit_request_reason}”</span>
              )}
              {!isSelf && perm("request_kyc_revision") && (
                <div style={{ marginTop: 8 }}>
                  <Button
                    size="small"
                    variant="primary"
                    busy={busy}
                    onClick={() =>
                      run(() =>
                        apiClient.put(API_ENDPOINTS.ALLOW_KYC_EDIT, {
                          username,
                        }),
                      )
                    }
                  >
                    Allow Editing
                  </Button>
                </div>
              )}
            </Banner>
          )}
          <div className={r.groups}>
            {KYC_GROUPS.map((g) => {
              const meta = GROUP_ICON[g.title] ?? {
                icon: "doc",
                tone: "accent",
              };
              const missing = g.fields.filter(
                (f) => !f.optional && isEmpty(k[f.key]),
              ).length;
              return (
                <FormSection
                  key={g.title}
                  icon={meta.icon}
                  tone={meta.tone}
                  title={g.title}
                  description={
                    missing
                      ? `${missing} required ${missing === 1 ? "detail" : "details"} missing`
                      : "Complete"
                  }
                  action={
                    g.title === "Identity Documents" || g.title === "Bank" ? (
                      <label className={inlineCheckClass}>
                        <Checkbox
                          checked={revealed}
                          onChange={(e) => setRevealed(e.target.checked)}
                        />
                        Show full numbers
                      </label>
                    ) : undefined
                  }
                >
                  <KeyValues
                    items={g.fields.map((f) => [f.label, value(f.key)])}
                  />
                </FormSection>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          run(() =>
            apiClient.post(API_ENDPOINTS.KYC_APPROVAL, {
              username,
              kyc_approval: "Approved",
            }),
          )
        }
        busy={busy}
        tone="accent"
        title="Approve KYC?"
        description="The record is finalised. Further changes need an update request."
        confirmLabel="Approve"
      />
      <Dialog
        open={dialog === "revise"}
        onClose={() => setDialog(null)}
        busy={busy}
        title="Request Revision"
        description="Choose the fields that need changes and say what’s wrong. The employee sees each note beside the field."
        size="lg"
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="danger"
              busy={busy}
              disabled={!Object.values(issues).some((v) => v.trim())}
              onClick={() =>
                run(() =>
                  apiClient.post(API_ENDPOINTS.KYC_APPROVAL, {
                    username,
                    kyc_approval: "Revision Requested",
                    field_issues: Object.fromEntries(
                      Object.entries(issues).filter(([, v]) => v.trim()),
                    ),
                  }),
                )
              }
            >
              Send Request
            </Button>
          </>
        }
      >
        <ul style={{ display: "grid", gap: 6 }}>
          {ALL_KYC_FIELDS.filter(
            (f) => !f.key.endsWith("line_1") && !f.key.endsWith("line_2"),
          ).map((f) => {
            const on = f.key in issues;
            return (
              <li key={f.key}>
                <label className={inlineCheckClass}>
                  <Checkbox
                    checked={on}
                    onChange={() =>
                      setIssues((x) => {
                        const n = { ...x };
                        if (on) delete n[f.key];
                        else n[f.key] = "";
                        return n;
                      })
                    }
                  />
                  {f.label}
                </label>
                <Collapse open={on}>
                  <div style={{ padding: "6px 0 8px 24px" }}>
                    <TextInput
                      aria-label={`Issue with ${f.label}`}
                      placeholder="What needs to change?"
                      value={issues[f.key] ?? ""}
                      onChange={(e) =>
                        setIssues((x) => ({ ...x, [f.key]: e.target.value }))
                      }
                    />
                  </div>
                </Collapse>
              </li>
            );
          })}
        </ul>
      </Dialog>
      <Dialog
        open={dialog === "request"}
        onClose={() => setDialog(null)}
        busy={busy}
        size="sm"
        title="Request KYC Update"
        description="HR reviews the request and unlocks your KYC for editing."
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!reason.trim()}
              onClick={() =>
                run(() =>
                  apiClient.post(API_ENDPOINTS.REQUEST_KYC_EDIT_ACCESS, {
                    reason: reason.trim(),
                  }),
                )
              }
            >
              Send Request
            </Button>
          </>
        }
      >
        <Field label="What do you need to change?">
          <TextArea
            data-autofocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </Dialog>
    </Page>
  );
}
