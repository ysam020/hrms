const store = new Map<string, string>();
const redis = {
  set: jest.fn(async (k: string, v: string) => {
    store.set(k, v);
    return "OK";
  }),
  get: jest.fn(async (k: string) => store.get(k) ?? null),
  getdel: jest.fn(async (k: string) => {
    const v = store.get(k) ?? null;
    store.delete(k);
    return v;
  }),
  del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
  incr: jest.fn(async (k: string) => {
    const n = Number(store.get(k) ?? 0) + 1;
    store.set(k, String(n));
    return n;
  }),
  expire: jest.fn(async () => 1),
};
jest.mock("@hrms/cache", () => ({ getRedisClient: () => redis }));

const findUnique = jest.fn();
jest.mock("@hrms/db", () => ({
  prismaWithTenant: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a) },
  },
}));

import {
  issueFaceChallenge,
  verifyFaceForAttendance,
  consumeFaceAttestation,
  issueAttestation,
  faceAttestationEnforced,
  isValidDescriptor,
} from "../services/faceAttestation";

const T1 = "tenant-a";
const T2 = "tenant-b";
const U1 = "user-1";
const U2 = "user-2";
const template = Array.from({ length: 128 }, () => 0.1);
const live = template.map((v, i) => (i === 0 ? v + 0.3 : v));
const stranger = template.map(() => 0.9);

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  findUnique.mockResolvedValue({ face_descriptor: template });
});

const challenge = async (t = T1, u = U1) =>
  (await issueFaceChallenge(t, u)).challengeId;

describe("verification", () => {
  it("accepts a matching descriptor and issues an attestation", async () => {
    const r = await verifyFaceForAttendance(T1, U1, await challenge(), live);
    expect(r).toEqual({ ok: true, attestation: expect.any(String) });
  });

  it("rejects a descriptor that does not match", async () => {
    const r = await verifyFaceForAttendance(
      T1,
      U1,
      await challenge(),
      stranger,
    );
    expect(r).toEqual({ ok: false, reason: "NO_MATCH" });
  });

  it("rejects a copy of the stored template", async () => {
    const r = await verifyFaceForAttendance(
      T1,
      U1,
      await challenge(),
      template,
    );
    expect(r).toEqual({ ok: false, reason: "NO_MATCH" });
  });

  it("reads an encrypted-form template", async () => {
    process.env.CRYPTO_ENCRYPTION_KEY = "e".repeat(64);
    const { encryptFaceDescriptor } = jest.requireActual("@hrms/crypto");
    findUnique.mockResolvedValue({
      face_descriptor: encryptFaceDescriptor(template),
    });
    const r = await verifyFaceForAttendance(T1, U1, await challenge(), live);
    expect(r.ok).toBe(true);
    delete process.env.CRYPTO_ENCRYPTION_KEY;
  });

  it("rejects when no face is enrolled", async () => {
    findUnique.mockResolvedValue({ face_descriptor: null });
    const r = await verifyFaceForAttendance(T1, U1, await challenge(), live);
    expect(r).toEqual({ ok: false, reason: "NOT_ENROLLED" });
  });

  it.each([
    ["boolean", true],
    ["wrong length", [0.1, 0.2]],
    ["strings", template.map(String)],
    ["NaN", template.map(() => NaN)],
    ["infinity", template.map(() => Infinity)],
    ["null", null],
  ])("rejects a fabricated descriptor: %s", async (_n, bad) => {
    const r = await verifyFaceForAttendance(T1, U1, await challenge(), bad);
    expect(r).toEqual({ ok: false, reason: "INVALID_DESCRIPTOR" });
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("challenges", () => {
  it("rejects a missing or forged challenge", async () => {
    for (const id of [undefined, "", "forged", { $ne: "" }]) {
      const r = await verifyFaceForAttendance(T1, U1, id, live);
      expect(r).toEqual({ ok: false, reason: "CHALLENGE_INVALID" });
    }
  });

  it("allows one attempt per challenge", async () => {
    const id = await challenge();
    expect((await verifyFaceForAttendance(T1, U1, id, stranger)).ok).toBe(
      false,
    );
    expect(await verifyFaceForAttendance(T1, U1, id, live)).toEqual({
      ok: false,
      reason: "CHALLENGE_INVALID",
    });
  });

  it("rejects an expired challenge", async () => {
    const id = await challenge();
    store.clear();
    expect(await verifyFaceForAttendance(T1, U1, id, live)).toEqual({
      ok: false,
      reason: "CHALLENGE_INVALID",
    });
  });

  it("sets a short expiry", async () => {
    await challenge();
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), "1", "EX", 120);
  });

  it("cannot be used by another user or tenant", async () => {
    const id = await challenge(T1, U1);
    expect((await verifyFaceForAttendance(T1, U2, id, live)).ok).toBe(false);
    expect((await verifyFaceForAttendance(T2, U1, id, live)).ok).toBe(false);
  });
});

describe("attestations", () => {
  it("is consumed once", async () => {
    const token = await issueAttestation(T1, U1);
    expect(await consumeFaceAttestation(T1, U1, token)).toBe(true);
    expect(await consumeFaceAttestation(T1, U1, token)).toBe(false);
  });

  it("rejects a fabricated or absent token", async () => {
    for (const t of [undefined, "", "made-up", true, { $ne: "" }]) {
      expect(await consumeFaceAttestation(T1, U1, t)).toBe(false);
    }
  });

  it("rejects an expired token", async () => {
    const token = await issueAttestation(T1, U1);
    store.clear();
    expect(await consumeFaceAttestation(T1, U1, token)).toBe(false);
  });

  it("cannot cross users or tenants", async () => {
    const token = await issueAttestation(T1, U1);
    expect(await consumeFaceAttestation(T1, U2, token)).toBe(false);
    expect(await consumeFaceAttestation(T2, U1, token)).toBe(false);
    expect(await consumeFaceAttestation(T1, U1, token)).toBe(true);
  });
});

describe("attempt limiting", () => {
  it("locks out after repeated failures, even with a valid face", async () => {
    for (let i = 0; i < 10; i++) {
      await verifyFaceForAttendance(T1, U1, await challenge(), stranger);
    }
    expect(
      await verifyFaceForAttendance(T1, U1, await challenge(), live),
    ).toEqual({
      ok: false,
      reason: "TOO_MANY_ATTEMPTS",
    });
  });

  it("clears the failure count after a success", async () => {
    await verifyFaceForAttendance(T1, U1, await challenge(), stranger);
    await verifyFaceForAttendance(T1, U1, await challenge(), live);
    expect([...store.keys()].some((k) => k.endsWith(":failures"))).toBe(false);
  });
});

describe("helpers", () => {
  it("enforcement is opt-in", () => {
    delete process.env.ATTENDANCE_FACE_ATTESTATION;
    expect(faceAttestationEnforced()).toBe(false);
    process.env.ATTENDANCE_FACE_ATTESTATION = "enforce";
    expect(faceAttestationEnforced()).toBe(true);
    delete process.env.ATTENDANCE_FACE_ATTESTATION;
  });

  it("validates descriptor shape", () => {
    expect(isValidDescriptor(template)).toBe(true);
    expect(isValidDescriptor(template.slice(1))).toBe(false);
  });
});
