/**
 * The FCM token write-back race, reproduced DETERMINISTICALLY
 * against real MongoDB (isolated replica set):
 *   1. a notification is queued for the employee and the worker sends it;
 *   2. the post-send token sync READS the employee's fcmTokens;
 *   3. the employee is terminated (status + fcmTokens: [] — exactly what
 *      editEmployeeDetails writes) — injected right after that read;
 *   4. the sync WRITES its read-modify-write result.
 * The fix (conditional updateMany) must leave the tokens cleared. On the
 * original code (unconditional update) the tokens come back.
 */
const mockFcmSend = jest.fn().mockResolvedValue("projects/x/messages/1");
jest.mock("../packages/firebase/dist/admin", () => ({
  getMessaging: () => ({ send: (...a: unknown[]) => mockFcmSend(...a) }),
}));

import { prisma } from "@hrms/db";
import { sendPushNotifications } from "@hrms/firebase";

const TENANT = "7e0000000000000000000001";
const EMP = "7f0000000000000000000001";
const oid = (id: string) => ({ $oid: id });

async function seed() {
  await prisma.$runCommandRaw({
    delete: "users",
    deletes: [{ q: { _id: oid(EMP) }, limit: 0 }],
  });
  await prisma.$runCommandRaw({
    insert: "users",
    documents: [
      {
        _id: oid(EMP),
        username: "it-race",
        email: "race@example.test",
        tenantId: oid(TENANT),
        employeeStatus: "Active",
        isSuperUser: false,
        permissions: [],
        role: [],
        fcmTokens: [
          {
            token: "tok-race",
            lastUsed: new Date(Date.now() - 86_400_000).toISOString(),
            deviceFingerprint: "dev-1",
          },
        ],
      },
    ],
  });
}

async function readUser() {
  const r: any = await prisma.$runCommandRaw({
    find: "users",
    filter: { _id: oid(EMP) },
  });
  return r.cursor.firstBatch[0];
}

afterAll(async () => {
  jest.restoreAllMocks();
  await prisma.$disconnect();
});

it("termination landing between the token sync's read and write is NOT undone", async () => {
  await seed();
  // Inject the termination right AFTER the sync reads the tokens. The
  // sync's read is the only prisma.user.findUnique in sendPushNotifications.
  const original = prisma.user.findUnique.bind(prisma.user);
  const spy = jest.spyOn(prisma.user, "findUnique").mockImplementation((async (
    args: any,
  ) => {
    const result = await original(args); // the sync has now read ["tok-race"]
    await prisma.$runCommandRaw({
      update: "users",
      updates: [
        {
          q: { _id: oid(EMP) },
          u: { $set: { employeeStatus: "Terminated", fcmTokens: [] } },
        },
      ],
    });
    return result;
  }) as any);

  const res = await sendPushNotifications(
    { tenantId: TENANT, userIds: [EMP] },
    "Chat",
    "preview",
  );
  expect(res.sentCount).toBe(1); // sent while still Active (send precedes the sync)
  expect(spy).toHaveBeenCalledTimes(1); // the race window was actually hit

  const after = await readUser();
  expect(after.employeeStatus).toBe("Terminated");
  expect(after.fcmTokens).toEqual([]); // original code: [{ token: "tok-race", lastUsed: <now> }]
});

it("a subsequent notification to the terminated employee sends nothing", async () => {
  mockFcmSend.mockClear();
  const res = await sendPushNotifications(
    { tenantId: TENANT, userIds: [EMP] },
    "Chat",
    "later",
  );
  expect(res.sentCount).toBe(0);
  expect(mockFcmSend).not.toHaveBeenCalled();
});
