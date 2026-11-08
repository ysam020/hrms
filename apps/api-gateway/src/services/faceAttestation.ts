import { randomBytes } from "node:crypto";
import { getRedisClient } from "@hrms/cache";
import { prismaWithTenant as prisma } from "@hrms/db";
import { readFaceDescriptor } from "@hrms/crypto";

/**
 * Server-side half of attendance face checks.
 *
 * The browser still runs the camera, the face model and the head-movement
 * check. The server issues a single-use challenge, compares the submitted
 * descriptor with the stored template, and issues a single-use attestation
 * that /add-attendance consumes. The template no longer needs to reach the
 * browser, and a punch can't be made without passing through this flow.
 *
 * LIMITATION: the descriptor is produced on the client, so this does not
 * prove a live person was in front of a camera. A client that can compute a
 * valid descriptor from a photo can still pass. Real liveness needs inference
 * on captured frames on the server.
 */

const CHALLENGE_TTL_SECONDS = 120;
const ATTESTATION_TTL_SECONDS = 120;
const FAILURE_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 10;
const MATCH_THRESHOLD = 0.6;
// Two live captures are never identical, so a near-zero distance means the
// stored template itself, or a copy of it, was submitted.
const REPLAY_DISTANCE = 0.02;
const DESCRIPTOR_LENGTH = 128;

export type FaceVerifyFailure =
  | "CHALLENGE_INVALID"
  | "NOT_ENROLLED"
  | "INVALID_DESCRIPTOR"
  | "NO_MATCH"
  | "TOO_MANY_ATTEMPTS";

export type FaceVerifyResult =
  | { ok: true; attestation: string }
  | { ok: false; reason: FaceVerifyFailure };

const scope = (tenantId: string, userId: string) =>
  `t:${tenantId}:face:${userId}`;
const challengeKey = (t: string, u: string, id: string) =>
  `${scope(t, u)}:challenge:${id}`;
const attestationKey = (t: string, u: string, id: string) =>
  `${scope(t, u)}:attestation:${id}`;
const failuresKey = (t: string, u: string) => `${scope(t, u)}:failures`;

const newToken = () => randomBytes(32).toString("hex");

export function faceAttestationEnforced(): boolean {
  return process.env.ATTENDANCE_FACE_ATTESTATION === "enforce";
}

export function isValidDescriptor(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === DESCRIPTOR_LENGTH &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export async function issueFaceChallenge(
  tenantId: string,
  userId: string,
): Promise<{ challengeId: string; expiresInSeconds: number }> {
  const challengeId = newToken();
  await getRedisClient().set(
    challengeKey(tenantId, userId, challengeId),
    "1",
    "EX",
    CHALLENGE_TTL_SECONDS,
  );
  return { challengeId, expiresInSeconds: CHALLENGE_TTL_SECONDS };
}

export async function issueAttestation(
  tenantId: string,
  userId: string,
): Promise<string> {
  const token = newToken();
  await getRedisClient().set(
    attestationKey(tenantId, userId, token),
    "1",
    "EX",
    ATTESTATION_TTL_SECONDS,
  );
  return token;
}

async function recordFailure(tenantId: string, userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = failuresKey(tenantId, userId);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, FAILURE_WINDOW_SECONDS);
}

export async function verifyFaceForAttendance(
  tenantId: string,
  userId: string,
  challengeId: unknown,
  descriptor: unknown,
): Promise<FaceVerifyResult> {
  const redis = getRedisClient();

  const failures = Number(await redis.get(failuresKey(tenantId, userId))) || 0;
  if (failures >= MAX_FAILURES) {
    return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
  }

  // Consumed before anything else, so one challenge allows one attempt.
  if (
    typeof challengeId !== "string" ||
    !(await redis.getdel(challengeKey(tenantId, userId, challengeId)))
  ) {
    return { ok: false, reason: "CHALLENGE_INVALID" };
  }
  if (!isValidDescriptor(descriptor)) {
    await recordFailure(tenantId, userId);
    return { ok: false, reason: "INVALID_DESCRIPTOR" };
  }

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { face_descriptor: true },
  });
  const template = readFaceDescriptor(row?.face_descriptor);
  if (template?.length !== DESCRIPTOR_LENGTH) {
    return { ok: false, reason: "NOT_ENROLLED" };
  }

  const d = distance(template, descriptor);
  if (d > MATCH_THRESHOLD || d < REPLAY_DISTANCE) {
    await recordFailure(tenantId, userId);
    return { ok: false, reason: "NO_MATCH" };
  }

  await redis.del(failuresKey(tenantId, userId));
  return { ok: true, attestation: await issueAttestation(tenantId, userId) };
}

/** Single use: a second call with the same token returns false. */
export async function consumeFaceAttestation(
  tenantId: string,
  userId: string,
  token: unknown,
): Promise<boolean> {
  if (typeof token !== "string" || !token) return false;
  return !!(await getRedisClient().getdel(
    attestationKey(tenantId, userId, token),
  ));
}
