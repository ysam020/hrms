// Public surface of the offline layer. See docs/offline-first.md.
export {
  OfflineProvider,
  useOfflineSummary,
  syncFromUi,
} from "./OfflineProvider";
export { OfflineStatusButton, PendingChanges } from "./ui/OfflineStatus";
export { DraftNote } from "./ui/DraftNote";
export { useOfflineDraft } from "./drafts";
export { sendOrQueue, type SendResult } from "./submit";
export { OfflineError } from "./queue";
export { createUpload } from "./uploads";
