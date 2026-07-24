import { randomUUID } from "crypto";
import { getEmailQueue, getNotificationQueue } from "@hrms/queue";
import type { NotifyOptions, NotifyResult } from "./types";

/**
 * Single entry point for triggering a notification across channels —
 * Phase 1 of the notify() migration (see the notification-architecture
 * plan): a thin wrapper that enqueues on exactly the same two BullMQ
 * queues every handler already calls directly today, with the same job
 * data shapes. No recipient resolution, template lookup, or channel
 * fan-out logic lives here yet — that's Phase 3+, once every call site has
 * moved onto this function and the migration itself carries zero risk of
 * behavior drift.
 *
 * Push is currently a flag on the in-app job (see NotificationJobData),
 * not an independent send — so push only fires when `inApp` is also
 * provided, matching today's coupling exactly. That constraint lifts once
 * push gets split into its own queue (Phase 4).
 */
export async function notify(options: NotifyOptions): Promise<NotifyResult> {
  const notificationId = randomUUID();
  const jobIds: NotifyResult["jobIds"] = {};

  if (options.inApp) {
    const job = await getNotificationQueue().add(options.event, {
      tenantId: options.tenantId,
      title: options.inApp.title,
      message: options.inApp.message,
      recipients: options.recipients,
      pushTargets: options.pushTargets,
      targetUser: options.targetUser,
      eventType: options.inApp.eventType,
      sendPushNotification: options.push?.enabled ?? true,
      priority: options.inApp.priority,
      silent: options.inApp.silent,
      socketEvent: options.inApp.socketEvent,
      socketPayload: options.inApp.socketPayload,
      metadata: { ...options.metadata, notificationId },
    });
    // Optional chaining — BullMQ's real Queue.add() always resolves a Job,
    // but plenty of existing handler tests mock queues with `.add: jest.fn()
    // .mockResolvedValue(undefined)` (they only assert the call args, not
    // the return value), and Phase 2 will migrate those call sites to this
    // function without necessarily updating that detail.
    jobIds.inApp = job?.id;
  }

  if (options.email) {
    const recipients = Array.isArray(options.email.to)
      ? options.email.to
      : [options.email.to];
    const { subject, html, from, replyTo, attachments } = options.email;
    const emailJobs = await Promise.all(
      recipients.map((to) =>
        getEmailQueue().add(options.event, {
          to,
          subject,
          html,
          from,
          replyTo,
          attachments,
        }),
      ),
    );
    jobIds.email = emailJobs
      .map((job) => job?.id)
      .filter((id): id is string => !!id);
  }

  return { notificationId, jobIds };
}
