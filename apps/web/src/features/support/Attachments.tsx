import { useContext, useEffect, useId, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { Button, Icon, IconButton, Spinner } from "@next/ui";
import { errorMessage } from "@next/lib/api";
import {
  attachmentUrl,
  checkFile,
  fileSize,
  uploadFile,
  type Side,
  type UploadedFile,
} from "./api";
import { ATTACHMENT_ACCEPT, LIMITS } from "./config";
import s from "./support.module.css";

/**
 * Choose files for a ticket or reply. Each file uploads and is verified by
 * the server as soon as it's chosen; `onBusyChange` lets the form hold its
 * submit button until every upload has finished.
 */
export function AttachmentPicker({
  side,
  value,
  onChange,
  onBusyChange,
  disabled,
}: {
  side: Side;
  value: UploadedFile[];
  onChange: (next: UploadedFile[]) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const { setAlert } = useContext(AlertContext);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [uploading, setUploading] = useState<string[]>([]);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    onBusyChange?.(uploading.length > 0);
  }, [uploading.length, onBusyChange]);

  const room = LIMITS.attachmentsPerMessage - value.length - uploading.length;

  const choose = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    if (!files.length) return;
    if (files.length > room) {
      setAlert({
        open: true,
        message: `You can attach up to ${LIMITS.attachmentsPerMessage} files.`,
        severity: "warning",
      });
    }
    for (const file of files.slice(0, Math.max(room, 0))) {
      const problem = checkFile(file);
      if (problem) {
        setAlert({ open: true, message: problem, severity: "error" });
        continue;
      }
      setUploading((u) => [...u, file.name]);
      try {
        const uploaded = await uploadFile(side, file);
        onChange([...latest.current, uploaded]);
      } catch (err) {
        setAlert({
          open: true,
          message: `${file.name}: ${errorMessage(err)}`,
          severity: "error",
        });
      } finally {
        setUploading((u) => {
          const i = u.indexOf(file.name);
          return i < 0 ? u : [...u.slice(0, i), ...u.slice(i + 1)];
        });
      }
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {(value.length > 0 || uploading.length > 0) && (
        <ul className={s.files} aria-label="Attachments">
          {value.map((f) => (
            <li key={f.id} className={s.file}>
              <Icon name="doc" />
              <span className={s.fileName} title={f.fileName}>
                {f.fileName}
              </span>
              <span className="px-meta">{fileSize(f.size)}</span>
              <IconButton
                icon="x"
                label={`Remove ${f.fileName}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((v) => v.id !== f.id))}
              />
            </li>
          ))}
          {uploading.map((name, i) => (
            <li key={`${name}-${i}`} className={s.file} aria-busy>
              <Spinner label={`Uploading ${name}`} />
              <span className={s.fileName}>{name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="px-row" style={{ gap: 12 }}>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={ATTACHMENT_ACCEPT}
          aria-describedby={hintId}
          onChange={(e) => choose(e.target.files)}
        />
        <Button
          icon="upload"
          size="small"
          disabled={disabled || room <= 0}
          onClick={() => input.current?.click()}
        >
          Attach Files
        </Button>
        <span id={hintId} className="px-meta">
          Images, PDF, TXT, LOG or CSV · up to{" "}
          {LIMITS.attachmentBytes / (1024 * 1024)} MB each ·{" "}
          {LIMITS.attachmentsPerMessage} per message
        </span>
      </div>
    </div>
  );
}

export interface AttachmentInfo {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
}

/** Attached files: image thumbnails and download links via signed URLs. */
export function AttachmentList({
  side,
  files,
}: {
  side: Side;
  files: AttachmentInfo[];
}) {
  const { setAlert } = useContext(AlertContext);
  if (files.length === 0) return null;
  const open = async (f: AttachmentInfo) => {
    // Open the tab synchronously (popup blockers), then point it at the link.
    // ("noopener" would make window.open return null, so detach by hand.)
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await attachmentUrl(side, f.id);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      tab?.close();
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };
  return (
    <ul className={s.files} aria-label="Attachments" style={{ marginTop: 8 }}>
      {files.map((f) => (
        <li key={f.id} style={{ display: "grid", gap: 4, minWidth: 0 }}>
          {f.contentType.startsWith("image/") && (
            <Thumbnail side={side} file={f} onOpen={() => open(f)} />
          )}
          <button
            type="button"
            className={s.file}
            onClick={() => open(f)}
            aria-label={`Open ${f.fileName} (${fileSize(f.size)})`}
            style={{ cursor: "pointer" }}
          >
            <Icon name="download" />
            <span className={s.fileName} title={f.fileName}>
              {f.fileName}
            </span>
            <span className="px-meta">{fileSize(f.size)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Thumbnail({
  side,
  file,
  onOpen,
}: {
  side: Side;
  file: AttachmentInfo;
  onOpen: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    attachmentUrl(side, file.id)
      .then((u) => live && setSrc(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [side, file.id]);
  return (
    <button
      type="button"
      className={s.thumbButton}
      onClick={onOpen}
      aria-label={`Preview ${file.fileName}`}
    >
      {src ? (
        <img className={s.thumb} src={src} alt="" loading="lazy" />
      ) : (
        <span className={s.thumb} aria-hidden />
      )}
    </button>
  );
}
