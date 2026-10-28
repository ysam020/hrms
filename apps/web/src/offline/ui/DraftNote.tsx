import { fromNow } from "@next/lib/format";
import type { DraftStatus } from "../drafts";
import s from "./offline.module.css";

/** One line under a form saying where its draft lives. */
export function DraftNote({
  status,
  savedAt,
  onDiscard,
}: {
  status: DraftStatus;
  savedAt: number | null;
  onDiscard: () => void;
}) {
  if (status === "idle" || !savedAt) return null;
  return (
    <p className={s.draftNote} role="status">
      {status === "restored"
        ? `Restored your draft from ${fromNow(savedAt)}.`
        : status === "error"
          ? "Couldn’t save a draft on this device."
          : status === "saving"
            ? "Saving draft…"
            : "Draft saved on this device."}
      {status !== "error" && (
        <button type="button" onClick={onDiscard}>
          Discard Draft
        </button>
      )}
    </p>
  );
}
