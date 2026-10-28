import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { diag } from "./diag";
import { getScope, setBusy, subscribe } from "./state";
import { getStore, isQuotaError, SCHEMA, type DraftRecord } from "./store";

// Form drafts, saved on this device as the person types. A draft belongs to
// the signed-in scope and a stable form key ("leave.apply", or
// "announcement.edit:<id>" for edits), survives reloads and browser restarts
// (subject to the browser keeping site data), and is removed once the form is
// sent or queued.

const SAVE_DELAY_MS = 400;

const draftId = (scope: string, formKey: string) => `${scope}|${formKey}`;

export async function loadDraft<T>(
  formKey: string,
): Promise<(DraftRecord & { data: T }) | undefined> {
  const scope = getScope();
  if (!scope) return undefined;
  const d = await (await getStore()).get("drafts", draftId(scope, formKey));
  return d as (DraftRecord & { data: T }) | undefined;
}

export async function saveDraft(
  formKey: string,
  data: unknown,
  baseVersion?: string,
) {
  const scope = getScope();
  if (!scope) return;
  await (
    await getStore()
  ).put("drafts", {
    id: draftId(scope, formKey),
    scope,
    formKey,
    data,
    baseVersion,
    updatedAt: Date.now(),
    schema: SCHEMA,
  });
}

export async function clearDraft(formKey: string) {
  const scope = getScope();
  if (!scope) return;
  await (await getStore()).delete("drafts", draftId(scope, formKey));
}

export type DraftStatus = "idle" | "restored" | "saving" | "saved" | "error";

/**
 * Keep a form's values as a local draft. Restores a saved draft when the
 * form opens (unless it equals the blank form), saves edits shortly after
 * each change and immediately when the page is hidden, and marks the form
 * busy while it holds unsaved edits so an app update won't reload over it.
 */
export function useOfflineDraft<T>({
  formKey,
  values,
  setValues,
  initial,
  enabled = true,
  baseVersion,
}: {
  formKey: string;
  values: T;
  setValues: (v: T) => void;
  /** The blank (or server-loaded) form; a draft equal to it isn't kept. */
  initial: T;
  enabled?: boolean;
  baseVersion?: string;
}) {
  // Drafts belong to the signed-in scope, which is set by OfflineProvider —
  // after this component's first effects run on a fresh load. Wait for it.
  const scope = useSyncExternalStore(subscribe, getScope);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const loaded = useRef(false);
  const latest = useRef(values);
  latest.current = values;
  const initialJson = JSON.stringify(initial);
  const dirty = enabled && JSON.stringify(values) !== initialJson;

  // Restore once per opening (and once the scope is known).
  useEffect(() => {
    if (!enabled || !scope) {
      loaded.current = false;
      if (!enabled) setStatus("idle");
      return;
    }
    let cancelled = false;
    void loadDraft<T>(formKey).then((d) => {
      if (cancelled) return;
      loaded.current = true;
      if (d && JSON.stringify(d.data) !== initialJson) {
        setValues(d.data);
        setSavedAt(d.updatedAt);
        setStatus("restored");
        diag("draft.restored", { form: formKey.split(":")[0] });
      }
    });
    return () => {
      cancelled = true;
    };
    // initialJson is intentionally read once per opening.
  }, [enabled, formKey, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useRef(async () => {});
  persist.current = async () => {
    if (!enabled || !loaded.current) return;
    const v = latest.current;
    try {
      if (JSON.stringify(v) === initialJson) await clearDraft(formKey);
      else await saveDraft(formKey, v, baseVersion);
      setSavedAt(Date.now());
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      diag("draft.save-failed", { quota: isQuotaError(err) });
    }
  };

  // Save shortly after each change.
  useEffect(() => {
    if (!enabled || !loaded.current) return;
    setStatus((s) => (s === "restored" ? s : "saving"));
    const t = setTimeout(() => void persist.current(), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [values, enabled]);

  // And straight away when the page is hidden or closed.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      if (document.visibilityState === "hidden") void persist.current();
    };
    const hide = () => void persist.current();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", hide);
    };
  }, [enabled]);

  useEffect(() => {
    setBusy(`form:${formKey}`, dirty);
    return () => setBusy(`form:${formKey}`, false);
  }, [formKey, dirty]);

  return {
    status,
    savedAt,
    dirty,
    /** Drop the draft (after the form is sent or queued, or on Discard). */
    async clear() {
      loaded.current = false;
      await clearDraft(formKey);
      setStatus("idle");
      setSavedAt(null);
    },
  };
}
