/** Webhook inbox against a real MongoDB (synthetic events only). */
process.env.CRYPTO_ENCRYPTION_KEY = "c".repeat(64);

import { prisma, ensureMasterIndexes } from "@hrms/db";
import { isFieldCiphertext } from "@hrms/crypto";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  MAX_WEBHOOK_ATTEMPTS,
} from "../apps/api-gateway/src/services/webhookInbox";

const BODY = '{"event":"subscription.charged","contact":"synthetic"}';
const input = (eventId = "evt_1") => ({
  provider: "razorpay",
  eventId,
  eventType: "subscription.charged",
  rawBody: BODY,
});
const row = (eventId = "evt_1") =>
  prisma.webhookInboxEvent.findUnique({
    where: { provider_eventId: { provider: "razorpay", eventId } },
  });
const id = (c: any) => c.id as string;

beforeAll(ensureMasterIndexes);
beforeEach(async () => {
  await prisma.webhookInboxEvent.deleteMany({});
});
afterAll(() => prisma.$disconnect());

it("claims a new event and seals its payload", async () => {
  expect((await claimWebhookEvent(input())).outcome).toBe("claimed");
  const r = await row();
  expect(r?.status).toBe("processing");
  expect(isFieldCiphertext(r?.payload)).toBe(true);
  expect(r?.payload).not.toContain("synthetic");
});

it("treats a redelivery after success as a duplicate and drops the payload", async () => {
  await completeWebhookEvent(id(await claimWebhookEvent(input())));
  expect((await claimWebhookEvent(input())).outcome).toBe("duplicate");
  expect((await row())?.payload).toBeNull();
});

it("lets a retry process an event that failed", async () => {
  await failWebhookEvent(
    id(await claimWebhookEvent(input())),
    new Error("database down"),
  );
  const retry = await claimWebhookEvent(input());
  expect(retry.outcome).toBe("claimed");
  expect((await row())?.attempts).toBe(2);
  await completeWebhookEvent(id(retry));
  expect((await row())?.status).toBe("processed");
});

it("does not store error text that could quote a payload", async () => {
  await failWebhookEvent(
    id(await claimWebhookEvent(input())),
    new TypeError("value 'synthetic' invalid"),
  );
  expect((await row())?.lastErrorName).toBe("TypeError");
});

it("holds off a delivery while another is working", async () => {
  await claimWebhookEvent(input());
  expect((await claimWebhookEvent(input())).outcome).toBe("in_progress");
});

it("recovers an event whose worker died", async () => {
  const c = await claimWebhookEvent(input());
  await prisma.webhookInboxEvent.update({
    where: { id: id(c) },
    data: { leaseUntil: new Date(Date.now() - 1000) },
  });
  expect((await claimWebhookEvent(input())).outcome).toBe("claimed");
});

it("lets exactly one of many concurrent deliveries through", async () => {
  const results = await Promise.all(
    Array.from({ length: 20 }, () => claimWebhookEvent(input("evt_race"))),
  );
  expect(results.filter((r) => r.outcome === "claimed")).toHaveLength(1);
});

it("lets exactly one concurrent retry take over", async () => {
  await failWebhookEvent(id(await claimWebhookEvent(input())), new Error("x"));
  const results = await Promise.all(
    Array.from({ length: 20 }, () => claimWebhookEvent(input())),
  );
  expect(results.filter((r) => r.outcome === "claimed")).toHaveLength(1);
});

it("parks an event that keeps failing", async () => {
  let c = await claimWebhookEvent(input());
  for (let i = 1; i < MAX_WEBHOOK_ATTEMPTS; i++) {
    await failWebhookEvent(id(c), new Error("x"));
    c = await claimWebhookEvent(input());
  }
  await failWebhookEvent(id(c), new Error("x"));
  const r = await row();
  expect(r?.status).toBe("dead");
  expect(isFieldCiphertext(r?.payload)).toBe(true);
  expect((await claimWebhookEvent(input())).outcome).toBe("duplicate");
});

it("keeps providers separate", async () => {
  await claimWebhookEvent(input());
  const other = await claimWebhookEvent({ ...input(), provider: "razorpayx" });
  expect(other.outcome).toBe("claimed");
});
