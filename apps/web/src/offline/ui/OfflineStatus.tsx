import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  Sheet,
  type IconName,
} from "@next/ui";
import { fromNow } from "@next/lib/format";
import { getStore, type MutationRecord } from "../store";
import { discardMutation, retryMutation, updateMutation } from "../queue";
import {
  getApplyUpdate,
  getScope,
  getVersion,
  isBusy,
  notify,
  subscribe,
} from "../state";
import { syncFromUi, useOfflineSummary } from "../OfflineProvider";
import { getUpload, reattachFile } from "../uploads";
import { recentDiagnostics } from "../diag";
import s from "./offline.module.css";

// The offline layer's visible parts:
//  - a quiet chip in the toolbar, shown only when there's something to know
//    (offline, unreachable, changes waiting or needing attention, an update);
//  - the Pending Changes sheet it opens: each queued change with its state,
//    and Retry / Discard / conflict choices. No payloads are shown — only the
//    label the form gave the change.

const STATUS_TEXT: Record<MutationRecord["status"], string> = {
  queued: "Waiting for connection",
  retrying: "Will retry",
  syncing: "Sending…",
  synced: "Sent",
  attention: "Needs attention",
  conflict: "Changed by someone else",
  auth: "Sign in to send",
};

export function OfflineStatusButton() {
  const summary = useOfflineSummary();
  const [open, setOpen] = useState(false);
  const { connectivity, waiting, syncing, attention, updateReady } = summary;

  let icon: IconName = "checkCircle";
  let label = "";
  let tone: "neutral" | "warning" | "danger" | "accent" = "neutral";
  if (attention) {
    icon = "alert";
    tone = "danger";
    label = `${attention} need${attention === 1 ? "s" : ""} attention`;
  } else if (connectivity === "offline") {
    icon = "info";
    tone = "warning";
    label = waiting ? `Offline · ${waiting} waiting` : "Offline";
  } else if (connectivity === "unreachable") {
    icon = "info";
    tone = "warning";
    label = waiting
      ? `Can’t reach Praesto · ${waiting}`
      : "Can’t reach Praesto";
  } else if (syncing) {
    icon = "refresh";
    tone = "accent";
    label = "Syncing…";
  } else if (waiting) {
    icon = "refresh";
    tone = "accent";
    label = `${waiting} waiting to sync`;
  } else if (updateReady) {
    icon = "download";
    tone = "accent";
    label = "Update available";
  }

  return (
    <>
      {label && (
        <button
          type="button"
          className={s.chip}
          data-tone={tone}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <Icon name={icon} size={14} />
          <span>{label}</span>
        </button>
      )}
      <span className={s.live} role="status" aria-live="polite">
        {label}
      </span>
      <PendingChanges open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function PendingChanges({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const summary = useOfflineSummary();
  const [confirmDiscard, setConfirmDiscard] = useState<MutationRecord | null>(
    null,
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const list = summary.ops
    .filter((o) => o.status !== "synced")
    .sort((a, b) => b.createdAt - a.createdAt);
  const recent = summary.ops
    .filter((o) => o.status === "synced")
    .sort((a, b) => (b.syncedAt ?? 0) - (a.syncedAt ?? 0))
    .slice(0, 5);
  const apply = getApplyUpdate();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Changes on This Device"
      width={440}
      footer={
        <div className={s.footer}>
          <Button
            variant="plain"
            onClick={() => setConfirmClear(true)}
            disabled={!getScope()}
          >
            Clear Offline Data…
          </Button>
          <Button
            variant="primary"
            icon="refresh"
            disabled={summary.connectivity === "offline" || !list.length}
            onClick={() => syncFromUi()}
          >
            Sync Now
          </Button>
        </div>
      }
    >
      <div className={s.body}>
        <p className={s.connection} data-state={summary.connectivity}>
          <span className={s.dot} />
          {summary.connectivity === "online"
            ? "Connected"
            : summary.connectivity === "offline"
              ? "You’re offline. Changes are saved on this device and sent when you reconnect."
              : "Praesto can’t be reached right now. Changes will be sent when it can."}
        </p>

        {summary.updateReady && apply && (
          <Banner tone="accent" icon="download">
            <span className={s.bannerRow}>
              A new version of Praesto is ready.
              <Button
                size="small"
                onClick={apply}
                disabled={isBusy()}
                title={
                  isBusy()
                    ? "Finish or save what you’re editing first"
                    : undefined
                }
              >
                Reload
              </Button>
            </span>
          </Banner>
        )}

        {list.length > 0 &&
          (!summary.durable || summary.persistent === false) && (
            <Banner tone="warning">
              {summary.durable
                ? "This browser may clear saved changes if the device runs low on space. Reconnect soon to send them."
                : "This browser can’t keep changes after the page is closed. Stay on this page until they’re sent."}
            </Banner>
          )}

        {summary.otherAccounts > 0 && (
          <Banner tone="neutral" icon="info">
            {summary.otherAccounts} change
            {summary.otherAccounts === 1 ? " was" : "s were"} saved on this
            device by another account or organisation. They’ll be sent when that
            account signs in here.
          </Banner>
        )}

        {list.length === 0 ? (
          <EmptyState icon="checkCircle" title="Everything is up to date">
            Changes you make while offline appear here until they’re sent.
          </EmptyState>
        ) : (
          <ul className={s.list}>
            {list.map((op) => (
              <PendingItem
                key={op.id}
                op={op}
                onDiscard={() => setConfirmDiscard(op)}
              />
            ))}
          </ul>
        )}

        {recent.length > 0 && (
          <section className={s.recent}>
            <h3 className="px-headline">Recently Sent</h3>
            <ul className={s.list}>
              {recent.map((op) => (
                <li key={op.id} className={s.item}>
                  <span className={s.itemTitle}>{op.label}</span>
                  <span className={s.meta}>
                    Sent {op.syncedAt ? fromNow(op.syncedAt) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className={s.diag}>
          <summary>Diagnostics</summary>
          <ol>
            {recentDiagnostics()
              .slice(-12)
              .reverse()
              .map((d, i) => (
                <li key={i}>
                  <time>{new Date(d.at).toLocaleTimeString()}</time> {d.event}
                  {d.detail
                    ? ` ${Object.entries(d.detail)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(" ")}`
                    : ""}
                </li>
              ))}
          </ol>
        </details>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDiscard)}
        onClose={() => setConfirmDiscard(null)}
        onConfirm={async () => {
          if (confirmDiscard) await discardMutation(confirmDiscard.id);
          setConfirmDiscard(null);
        }}
        title="Discard This Change?"
        description={`“${confirmDiscard?.label ?? ""}” hasn’t reached the server and will be removed from this device.`}
        confirmLabel="Discard"
      />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          const scope = getScope();
          if (scope) await (await getStore()).clearScope(scope);
          notify();
          setConfirmClear(false);
        }}
        title="Clear Offline Data?"
        description="Removes your drafts, unsent changes and attached files saved on this device. Anything not yet sent will be lost."
        confirmLabel="Clear"
      />
    </Sheet>
  );
}

function PendingItem({
  op,
  onDiscard,
}: {
  op: MutationRecord;
  onDiscard: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const needsFile = op.lastError?.code === "upload";
  const canRetry = ["attention", "retrying", "queued"].includes(op.status);
  const server = op.serverCopy as Record<string, unknown> | undefined;

  return (
    <li className={s.item} data-status={op.status}>
      <div className={s.itemHead}>
        <span className={s.itemTitle}>{op.label}</span>
        <span className={s.badge} data-status={op.status}>
          {STATUS_TEXT[op.status]}
        </span>
      </div>
      <span className={s.meta}>Saved {fromNow(op.createdAt)}</span>
      {op.lastError && op.status !== "queued" && (
        <p className={s.error}>{op.lastError.message}</p>
      )}

      {op.status === "conflict" && server && (
        <dl className={s.diff}>
          {Object.keys(op.body)
            .filter(
              (k) =>
                k in server &&
                JSON.stringify(server[k]) !== JSON.stringify(op.body[k]),
            )
            .map((k) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  <span className={s.theirs}>
                    Now: {String(server[k] ?? "—")}
                  </span>
                  <span className={s.mine}>
                    Yours: {String(op.body[k] ?? "—")}
                  </span>
                </dd>
              </div>
            ))}
        </dl>
      )}

      <div className={s.actions}>
        {op.status === "conflict" ? (
          <>
            <Button
              size="small"
              onClick={async () => {
                // Keep my version: send it again against the current copy.
                await updateMutation(op.id, {
                  ifMatch: server?.lastUpdatedOn
                    ? new Date(String(server.lastUpdatedOn)).toISOString()
                    : undefined,
                  status: "queued",
                  attempts: 0,
                  nextAttemptAt: Date.now(),
                  lastError: undefined,
                });
                void syncFromUi();
              }}
            >
              Keep Mine
            </Button>
            <Button size="small" variant="plain" onClick={onDiscard}>
              Use Theirs
            </Button>
          </>
        ) : (
          <>
            {needsFile && (
              <>
                <Button size="small" onClick={() => fileRef.current?.click()}>
                  Choose File Again
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    const id = op.uploads?.[0]?.uploadId;
                    if (!f || !id) return;
                    try {
                      setFileError(null);
                      await reattachFile(id, f);
                      await retryMutation(op.id);
                      void syncFromUi();
                    } catch (err) {
                      setFileError((err as Error).message);
                    }
                  }}
                />
              </>
            )}
            {canRetry && !needsFile && (
              <Button
                size="small"
                onClick={async () => {
                  await retryMutation(op.id);
                  void syncFromUi();
                }}
              >
                Retry
              </Button>
            )}
            <Button size="small" variant="plain" onClick={onDiscard}>
              Discard
            </Button>
          </>
        )}
      </div>
      {fileError && <p className={s.error}>{fileError}</p>}
      <UploadNote op={op} />
    </li>
  );
}

/** Progress of an attached file, from the upload record. */
function UploadNote({ op }: { op: MutationRecord }) {
  const id = op.uploads?.[0]?.uploadId;
  const version = useSyncExternalStore(subscribe, getVersion);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void getUpload(id).then((u) => {
      if (cancelled) return;
      if (!u) return setText(null);
      const parts = u.partCount
        ? ` · ${u.confirmedParts.length} of ${u.partCount} parts confirmed`
        : "";
      setText(`${u.fileName}: ${uploadText[u.status]}${parts}`);
    });
    return () => {
      cancelled = true;
    };
  }, [id, version]);
  return text ? <span className={s.meta}>{text}</span> : null;
}

const uploadText: Record<string, string> = {
  selected: "waiting to upload",
  waiting: "waiting for connection",
  uploading: "uploading",
  paused: "paused",
  interrupted: "interrupted, will resume",
  verifying: "verifying",
  completed: "uploaded",
  failed: "failed",
  "needs-file": "choose the file again",
};
