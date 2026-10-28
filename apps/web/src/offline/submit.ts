import { apiClient } from "@next/lib/api";
import { diag } from "./diag";
import {
  createMutation,
  enqueue,
  listMutations,
  OfflineError,
  type NewMutation,
} from "./queue";
import { getConnectivity, getScope, markReachable } from "./state";
import { syncNow } from "./sync";

// One call for forms that can work offline: send now when the API is
// reachable, otherwise keep the operation on this device and send it when the
// connection returns. The same Idempotency-Key is used for the direct attempt
// and any later replay, so a request that reached the server but lost its
// response can't be applied twice.
//
// The result says which happened — forms must say "Sent" only for
// { queued: false }, and "Saved on this device" for { queued: true }.

export type SendResult =
  | { queued: false; data: any }
  | { queued: true; id: string };

export async function sendOrQueue(m: NewMutation): Promise<SendResult> {
  const scope = getScope();
  if (!scope)
    throw new OfflineError("Sign in to save this change.", "no-session");
  const record = createMutation(m, scope);

  // Attachments go through the resumable uploader, which the queue drives.
  const mustQueue = Boolean(m.uploads?.length);

  if (!mustQueue && getConnectivity() === "online") {
    try {
      const headers: Record<string, string> = {
        "Idempotency-Key": record.idempotencyKey,
      };
      if (m.ifMatch) headers["If-Match"] = m.ifMatch;
      const res = await apiClient.request({
        method: m.method,
        url: m.url,
        data: m.body,
        headers,
      });
      return { queued: false, data: res.data };
    } catch (err: any) {
      // A server answer (validation, permission, conflict) is the form's to
      // show, exactly as before. Only a lost connection falls through.
      if (err?.response) throw err;
      markReachable(false);
      diag("submit.fell-back-to-queue", { kind: m.kind });
    }
  }

  await enqueue(record);
  if (mustQueue && getConnectivity() === "online") {
    // Online with an attachment: upload and send right away, then report
    // what actually happened.
    await syncNow();
    const now = (await listMutations()).find((o) => o.id === record.id);
    if (now?.status === "synced") return { queued: false, data: null };
  }
  return { queued: true, id: record.id };
}
