import { useContext, useEffect, useId, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import handleFileUpload from "@web/shared/utils/handleFileUpload";
import { apiClient } from "@next/lib/api";
import { getConnectivity } from "@next/offline/state";
import { createUpload } from "@next/offline/uploads";
import { Button } from "./controls";
import { Icon } from "./Icon";

// File upload with Classic's own pipeline (size checks, presigned URL,
// direct S3 PUT) — handleFileUpload expects a PrimeReact upload event and a
// Formik bag, so we hand it minimal adapters for both.
//
// With `offlineCapable`, a file chosen while offline isn't uploaded: it's
// kept on this device for a resumable upload (src/offline/uploads.ts) and the
// value becomes "upload:<id>". The form's queued submission sends the file
// first and puts its URL in place of that reference.

export const PENDING_UPLOAD = "upload:";

export function FileField({
  value,
  onChange,
  folder,
  accept = "image/*,application/pdf",
  multiple = false,
  label = "Choose File",
  disabled,
  offlineCapable = false,
}: {
  value: string | string[] | null | undefined;
  onChange: (next: string | string[]) => void;
  /** S3 folder, same names Classic uses (e.g. "leave_medical_certificates"). */
  folder: string;
  accept?: string;
  multiple?: boolean;
  label?: string;
  disabled?: boolean;
  /** Single files only: keep a file chosen offline for upload later. */
  offlineCapable?: boolean;
}) {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const all = (Array.isArray(value) ? value : value ? [value] : []).filter(
    Boolean,
  );
  const pending = all.find((u) => u.startsWith(PENDING_UPLOAD));
  const urls = all.filter((u) => !u.startsWith(PENDING_UPLOAD));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (offlineCapable && !multiple && getConnectivity() !== "online") {
      try {
        const rec = await createUpload(files[0], {
          folder,
          username: user?.username ?? "",
          field: folder,
        });
        setPendingName(rec.fileName);
        onChange(`${PENDING_UPLOAD}${rec.id}`);
      } catch (err) {
        setAlert({
          open: true,
          message: (err as Error).message,
          severity: "error",
        });
      } finally {
        if (input.current) input.current.value = "";
      }
      return;
    }
    setBusy(true);
    try {
      await handleFileUpload(
        { files: Array.from(files), options: { clear: () => {} } },
        {
          setValues: (
            fn: (v: Record<string, unknown>) => Record<string, unknown>,
          ) => {
            const next = fn({})[id];
            if (next)
              onChange(
                multiple ? [...urls, ...(next as string[])] : (next as string),
              );
          },
        },
        id,
        folder,
        () => {},
        multiple,
        setAlert,
        user?.username,
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => upload(e.target.files)}
      />
      <Button
        icon="upload"
        onClick={() => input.current?.click()}
        busy={busy}
        disabled={disabled}
      >
        {(urls.length || pending) && !multiple ? "Replace File" : label}
      </Button>
      {pending && (
        <span className="px-row" style={{ flexWrap: "nowrap", gap: 6 }}>
          <Icon name="doc" />
          <span className="px-callout">
            {pendingName ?? "File"} · saved on this device, uploads when you’re
            back online
          </span>
          {!disabled && (
            <Button size="small" variant="plain" onClick={() => onChange("")}>
              Remove
            </Button>
          )}
        </span>
      )}
      {urls.map((u) => (
        <FileLink
          key={u}
          url={u}
          onRemove={
            disabled
              ? undefined
              : () => onChange(multiple ? urls.filter((x) => x !== u) : "")
          }
        />
      ))}
    </div>
  );
}

/** A stored file, opened through a short-lived signed URL (as in Classic). */
export function FileLink({
  url,
  label,
  onRemove,
}: {
  url: string;
  label?: string;
  onRemove?: () => void;
}) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    apiClient
      .post(API_ENDPOINTS.UPLOAD_VIEW_URL, { fileUrl: url })
      .then((r) => live && setHref(r.data?.data?.url ?? null))
      .catch(() => live && setHref(null));
    return () => {
      live = false;
    };
  }, [url]);
  const name =
    label || decodeURIComponent(url.split("/").pop()?.split("?")[0] || "File");
  return (
    <span className="px-row" style={{ flexWrap: "nowrap", gap: 6 }}>
      <Icon name="doc" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="px-truncate"
          style={{ maxWidth: 280 }}
        >
          {name}
        </a>
      ) : (
        <span className="px-truncate px-secondary" style={{ maxWidth: 280 }}>
          {name}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          className="px-link-button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          Remove
        </button>
      )}
    </span>
  );
}
