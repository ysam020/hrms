import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { getPresenceQueue } from "@hrms/queue";
import {
  BLOCKED_EMPLOYEE_STATUSES,
  HR_ROLES,
  hasPrivilegedRole,
} from "@hrms/common";
import { getActiveSettings } from "../handlers/tenantSettings";
import {
  applyChoice,
  displayRank,
  displayStatus,
  effectiveStatus,
  expiryFor,
  isTimeZone,
  restorePrevious,
  withMessage,
  workModeFor,
  DISPLAY_STATUSES,
  type Availability,
  type Choice,
  type Connectivity,
  type DisplayStatus,
  type Duration,
  type EffectiveStatus,
  type NextStatus,
  type StoredStatus,
  type WorkMode,
} from "./presenceRules";
import {
  publishPresence,
  readConnectivity,
  syncDoNotDisturb,
} from "./presenceConnectivity";

dayjs.extend(utc);

// Employee availability (docs/presence.md). Callers run inside a tenant
// context (runWithTenant — the request middleware, or the socket/worker
// wrappers): `prisma.presenceStatus` then reaches only that tenant's
// database, and every where clause also names the tenant id from the token.

export const MAX_WATCH = 500;
/** People examined for one organisation-wide list (after search). */
export const ORG_CANDIDATE_CAP = 2000;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

export class PresenceConflictError extends Error {
  httpStatus = 409;
  constructor() {
    super("Your status changed somewhere else. Please try again.");
  }
}

// ── Who can see whom ────────────────────────────────────────────────────────

export interface Viewer {
  tenantId: string;
  userId: string;
  /** HR roles, superusers and `Presence:view:all` holders. */
  orgWide: boolean;
  /** Everyone the viewer shares a team with (leader or member). */
  teammates: Set<string>;
}

export async function resolveViewer(
  tenantId: string,
  userId: string,
  tenantRole: string | null | undefined,
): Promise<Viewer> {
  const [user, teams] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperUser: true, permissions: true },
    }),
    prisma.team.findMany({
      where: { OR: [{ teamLeaderId: userId }, { members: { has: userId } }] },
      select: { teamLeaderId: true, members: true },
    }),
  ]);
  const perms: string[] = (user?.permissions as string[]) ?? [];
  const teammates = new Set<string>();
  for (const t of teams)
    for (const id of [t.teamLeaderId, ...(t.members ?? [])])
      if (id !== userId) teammates.add(id);
  return {
    tenantId,
    userId,
    orgWide:
      Boolean(user?.isSuperUser) ||
      hasPrivilegedRole(tenantRole, HR_ROLES) ||
      perms.includes("Presence:view:all"),
    teammates,
  };
}

export const canSee = (viewer: Viewer, userId: string) =>
  viewer.orgWide || userId === viewer.userId || viewer.teammates.has(userId);

const PERSON_SELECT = {
  id: true,
  username: true,
  first_name: true,
  last_name: true,
  designation: true,
  department: true,
  employee_photo: true,
  attendanceMode: true,
} as const;

type PersonRow = {
  id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  department: string | null;
  employee_photo: string | null;
  attendanceMode: string | null;
};

const activeOnly = {
  employeeStatus: { notIn: [...BLOCKED_EMPLOYEE_STATUSES] },
};

/**
 * The requested people the viewer may see, as current members of the
 * viewer's own organisation (the user model is tenant-scoped, so an id from
 * another organisation simply isn't found).
 */
export async function visiblePeople(
  viewer: Viewer,
  ids: unknown[],
): Promise<PersonRow[]> {
  const wanted = [
    ...new Set(ids.filter((x): x is string => typeof x === "string")),
  ]
    .filter((id) => OBJECT_ID.test(id) && canSee(viewer, id))
    .slice(0, MAX_WATCH);
  if (wanted.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: wanted }, ...activeOnly },
    select: PERSON_SELECT,
  });
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** What a colleague sees. Nothing else about the person is broadcast. */
export interface PresenceView {
  userId: string;
  availability: Availability;
  status: DisplayStatus;
  connectivity: Connectivity;
  source: "manual" | "default";
  message: string | null;
  expiresAt: string | null;
  workMode: WorkMode | null;
  /** Only while offline. */
  lastSeenAt: string | null;
  revision: number;
  /** Server time of this snapshot (ms) — newer connectivity wins on clients. */
  at: number;
}

/** The person's own view adds what they need to manage it. */
export interface OwnPresence extends PresenceView {
  previous: Choice | null;
  timeZone: string | null;
}

type Row = StoredStatus & {
  id: string;
  userId: string;
  timeZone: string | null;
  lastActiveAt: Date | null;
};

function findRow(tenantId: string, userId: string): Promise<Row | null> {
  return prisma.presenceStatus.findFirst({
    where: { tenantId, userId },
    orderBy: { createdAt: "asc" },
  });
}

export function toView(
  userId: string,
  eff: EffectiveStatus,
  connectivity: Connectivity,
  extras: { workMode: WorkMode | null; lastActiveAt: Date | null },
  now: Date,
): PresenceView {
  return {
    userId,
    availability: eff.availability,
    status: displayStatus(eff.availability, connectivity),
    connectivity,
    source: eff.source,
    message: eff.message,
    expiresAt: eff.expiresAt?.toISOString() ?? null,
    workMode: extras.workMode,
    lastSeenAt:
      connectivity === "offline" && extras.lastActiveAt
        ? extras.lastActiveAt.toISOString()
        : null,
    revision: eff.revision,
    at: now.getTime(),
  };
}

async function safeConnectivity(tenantId: string, ids: string[]) {
  try {
    return await readConnectivity(tenantId, ids);
  } catch (err) {
    logger.warn("presence: connectivity unavailable", { err });
    return new Map<string, Connectivity>();
  }
}

async function remoteToday(ids: string[], now: Date): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  // WFH dates are stored as UTC midnight of the requested day.
  const day = dayjs.utc(now).startOf("day").toDate();
  const rows = await prisma.wfhRequest.findMany({
    where: {
      userId: { in: ids },
      status: "Approved",
      date: { lte: day },
      toDate: { gte: day },
    },
    select: { userId: true },
  });
  return new Set(rows.map((r: { userId: string }) => r.userId));
}

/** Presence for people already known to be visible, in one batch. */
export async function viewsFor(
  tenantId: string,
  people: Pick<PersonRow, "id" | "attendanceMode">[],
  now = new Date(),
): Promise<Map<string, PresenceView>> {
  const ids = people.map((p) => p.id);
  const out = new Map<string, PresenceView>();
  if (ids.length === 0) return out;
  const [rows, connectivity, remote] = await Promise.all([
    prisma.presenceStatus.findMany({
      where: { tenantId, userId: { in: ids } },
      orderBy: { createdAt: "asc" },
    }) as Promise<Row[]>,
    safeConnectivity(tenantId, ids),
    remoteToday(ids, now),
  ]);
  const byUser = new Map<string, Row>();
  for (const r of rows) if (!byUser.has(r.userId)) byUser.set(r.userId, r);
  for (const p of people) {
    const row = byUser.get(p.id) ?? null;
    out.set(
      p.id,
      toView(
        p.id,
        effectiveStatus(row, now),
        connectivity.get(p.id) ?? "offline",
        {
          workMode: workModeFor(p.attendanceMode, remote.has(p.id)),
          lastActiveAt: row?.lastActiveAt ?? null,
        },
        now,
      ),
    );
  }
  return out;
}

export async function ownPresence(
  tenantId: string,
  userId: string,
  now = new Date(),
): Promise<OwnPresence> {
  const [row, me] = await Promise.all([
    findRow(tenantId, userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, attendanceMode: true },
    }),
  ]);
  const [connectivity, remote] = await Promise.all([
    safeConnectivity(tenantId, [userId]),
    remoteToday([userId], now),
  ]);
  const eff = effectiveStatus(row, now);
  return {
    ...toView(
      userId,
      eff,
      connectivity.get(userId) ?? "offline",
      {
        workMode: workModeFor(me?.attendanceMode, remote.has(userId)),
        lastActiveAt: row?.lastActiveAt ?? null,
      },
      now,
    ),
    previous: eff.previous,
    timeZone: row?.timeZone ?? null,
  };
}

// ── People list (the Availability page) ─────────────────────────────────────

export type PeopleScope = "team" | "organisation";

export interface PeopleQuery {
  scope: PeopleScope;
  status?: DisplayStatus;
  search?: string;
  page: number;
  limit: number;
}

const nameOf = (p: PersonRow) =>
  `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.username;

export async function listPeople(
  viewer: Viewer,
  q: PeopleQuery,
  now = new Date(),
) {
  const search = q.search?.trim().slice(0, 80);
  const where: Record<string, unknown> = { ...activeOnly };
  if (q.scope === "team")
    where.id = { in: [viewer.userId, ...viewer.teammates] };
  if (search)
    where.OR = [
      { first_name: { contains: search, mode: "insensitive" } },
      { last_name: { contains: search, mode: "insensitive" } },
      { username: { contains: search, mode: "insensitive" } },
    ];
  const candidates: PersonRow[] = await prisma.user.findMany({
    where,
    select: PERSON_SELECT,
    orderBy: [{ first_name: "asc" }, { last_name: "asc" }],
    take: ORG_CANDIDATE_CAP + 1,
  });
  const truncated = candidates.length > ORG_CANDIDATE_CAP;
  if (truncated) candidates.length = ORG_CANDIDATE_CAP;

  const views = await viewsFor(viewer.tenantId, candidates, now);
  const counts = Object.fromEntries(
    DISPLAY_STATUSES.map((s) => [s, 0]),
  ) as Record<DisplayStatus, number>;
  for (const v of views.values()) counts[v.status]++;

  const matching = candidates
    .filter((p) => !q.status || views.get(p.id)!.status === q.status)
    .sort(
      (a, b) =>
        displayRank(views.get(a.id)!.status) -
          displayRank(views.get(b.id)!.status) ||
        nameOf(a).localeCompare(nameOf(b)),
    );
  const start = (q.page - 1) * q.limit;
  return {
    people: matching.slice(start, start + q.limit).map((p) => ({
      id: p.id,
      username: p.username,
      name: nameOf(p),
      designation: p.designation,
      department: p.department,
      photo: p.employee_photo,
      presence: views.get(p.id)!,
    })),
    counts,
    total: matching.length,
    truncated,
  };
}

// ── Writing ─────────────────────────────────────────────────────────────────

const sameNext = (eff: EffectiveStatus, next: NextStatus) =>
  eff.availability === next.availability &&
  eff.source === next.source &&
  eff.message === next.message &&
  (eff.expiresAt?.getTime() ?? null) === (next.expiresAt?.getTime() ?? null) &&
  eff.previous?.availability === next.previous?.availability &&
  eff.previous?.message === next.previous?.message;

const stored = (next: NextStatus) => ({
  availability: next.availability,
  source: next.source,
  message: next.message,
  expiresAt: next.expiresAt,
  previousAvailability: next.previous?.availability ?? null,
  previousMessage: next.previous?.message ?? null,
});

export interface WriteResult {
  presence: OwnPresence;
  changed: boolean;
}

/**
 * Read-compute-write with a revision check, so two devices changing the
 * status at once can't interleave (the later write recomputes on top of the
 * earlier one), and anything holding an old revision — an expiry job — loses.
 */
async function mutate(
  tenantId: string,
  userId: string,
  compute: (eff: EffectiveStatus, now: Date) => NextStatus,
  opts: { timeZone?: string } = {},
): Promise<WriteResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = new Date();
    const row = await findRow(tenantId, userId);
    const eff = effectiveStatus(row, now);
    const next = compute(eff, now);
    const timeZone = opts.timeZone ?? row?.timeZone ?? null;
    // An expired row must still be written back, even if it reads the same.
    const expiredUnderneath = Boolean(
      row?.expiresAt && row.expiresAt.getTime() <= now.getTime(),
    );
    if (
      row &&
      !expiredUnderneath &&
      sameNext(eff, next) &&
      timeZone === row.timeZone
    )
      return {
        presence: await ownPresence(tenantId, userId, now),
        changed: false,
      };

    if (!row) {
      try {
        await prisma.presenceStatus.create({
          data: {
            tenantId,
            userId,
            ...stored(next),
            timeZone,
            lastActiveAt: null,
            revision: 1,
            changedAt: now,
          },
        });
      } catch (err: any) {
        if (err?.code === "P2002") continue; // created concurrently — retry
        throw err;
      }
    } else {
      const { count } = await prisma.presenceStatus.updateMany({
        where: { id: row.id, revision: row.revision },
        data: {
          ...stored(next),
          timeZone,
          revision: row.revision + 1,
          changedAt: now,
        },
      });
      if (count === 0) continue; // someone else wrote first — recompute
    }
    const revision = (row?.revision ?? 0) + 1;
    await afterWrite(tenantId, userId, next, revision, row);
    return { presence: await ownPresence(tenantId, userId), changed: true };
  }
  throw new PresenceConflictError();
}

const jobId = (tenantId: string, userId: string, revision: number) =>
  `px-${tenantId}-${userId}-${revision}`;

/** Expiry job, Do Not Disturb flag and the live event — best effort each. */
async function afterWrite(
  tenantId: string,
  userId: string,
  next: NextStatus,
  revision: number,
  before: Row | null,
): Promise<void> {
  const queue = getPresenceQueue();
  const tasks: Promise<unknown>[] = [
    syncDoNotDisturb(
      tenantId,
      userId,
      next.availability === "dnd",
      next.expiresAt,
    ),
    broadcast(tenantId, userId),
  ];
  // The old job would find a newer revision and do nothing; removing it just
  // keeps the queue tidy.
  if (before?.expiresAt)
    tasks.push(queue.remove(jobId(tenantId, userId, before.revision)));
  if (next.expiresAt)
    tasks.push(
      queue.add(
        "expire",
        { tenantId, userId, revision },
        {
          delay: Math.max(0, next.expiresAt.getTime() - Date.now()),
          jobId: jobId(tenantId, userId, revision),
        },
      ),
    );
  const results = await Promise.allSettled(tasks);
  for (const r of results)
    if (r.status === "rejected")
      logger.warn("presence: side effect failed", { err: r.reason });
}

/** Send the person's current presence to everyone watching them. */
export async function broadcast(tenantId: string, userId: string) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, attendanceMode: true },
  });
  if (!me) return;
  const view = (await viewsFor(tenantId, [me])).get(userId);
  if (view) await publishPresence(tenantId, userId, view);
}

export interface SetStatusInput {
  availability?: Availability;
  message?: string | null;
  duration?: Duration;
  timeZone?: string;
}

async function workdayFor(tenantId: string) {
  const s = await getActiveSettings(tenantId).catch(() => null);
  return {
    startHour: s?.workStartHour ?? 9,
    startMinute: s?.workStartMinute ?? 0,
    hours: s?.fullDayMinHours ?? 8,
  };
}

/**
 * Pick a status (with an optional message and duration), or — when no
 * availability is given — change only the message.
 */
export async function setStatus(
  tenantId: string,
  userId: string,
  input: SetStatusInput,
): Promise<WriteResult> {
  const timeZone = isTimeZone(input.timeZone) ? input.timeZone : undefined;
  const workday =
    input.duration === "end_of_day" ? await workdayFor(tenantId) : null;
  return mutate(
    tenantId,
    userId,
    (eff, now) => {
      if (!input.availability) return withMessage(eff, input.message ?? null);
      const expiresAt = expiryFor(
        input.duration ?? "until_changed",
        now,
        timeZone ?? "UTC",
        workday ?? { startHour: 9, startMinute: 0, hours: 8 },
      );
      return applyChoice(
        eff,
        { availability: input.availability, message: input.message ?? null },
        expiresAt,
      );
    },
    { timeZone },
  );
}

export const restoreStatus = (tenantId: string, userId: string) =>
  mutate(tenantId, userId, (eff) => restorePrevious(eff));

export const clearMessage = (tenantId: string, userId: string) =>
  mutate(tenantId, userId, (eff) => withMessage(eff, null));

/**
 * The expiry job: end a timed status, but only if it is still the one the
 * job was scheduled for. Returns whether anything changed.
 */
export async function expireIfCurrent(
  tenantId: string,
  userId: string,
  revision: number,
  now = new Date(),
): Promise<boolean> {
  const row = await findRow(tenantId, userId);
  if (!row || row.revision !== revision || !row.expiresAt) return false;
  if (row.expiresAt.getTime() > now.getTime()) {
    // Ran early (clock skew between hosts) — let BullMQ retry shortly.
    throw new Error("presence status has not expired yet");
  }
  const restored = effectiveStatus(row, now);
  const next: NextStatus = {
    availability: restored.availability,
    source: restored.source,
    message: restored.message,
    expiresAt: null,
    previous: null,
  };
  const { count } = await prisma.presenceStatus.updateMany({
    where: { id: row.id, revision },
    data: { ...stored(next), revision: revision + 1, changedAt: row.expiresAt },
  });
  if (count === 0) return false;
  await afterWrite(tenantId, userId, next, revision + 1, null);
  return true;
}

/** The person's last connection closed: remember when (once per session). */
export async function markLastActive(
  tenantId: string,
  userId: string,
  at: Date,
): Promise<void> {
  const { count } = await prisma.presenceStatus.updateMany({
    where: { tenantId, userId },
    data: { lastActiveAt: at },
  });
  if (count > 0) return;
  await prisma.presenceStatus
    .create({
      data: {
        tenantId,
        userId,
        availability: "available",
        source: "default",
        message: null,
        expiresAt: null,
        previousAvailability: null,
        previousMessage: null,
        timeZone: null,
        revision: 0,
        lastActiveAt: at,
        changedAt: at,
      },
    })
    .catch((err: any) => {
      if (err?.code !== "P2002") throw err;
    });
}
