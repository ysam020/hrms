import {
  aggregateConnectivity,
  applyChoice,
  cleanMessage,
  displayStatus,
  effectiveStatus,
  endOfWorkday,
  expiryFor,
  isTimeZone,
  restorePrevious,
  withMessage,
  workModeFor,
  type StoredStatus,
} from "../services/presenceRules";
import {
  presenceBatchQuerySchema,
  presencePeopleQuerySchema,
  presenceUpdateSchema,
} from "../schemas";

const NOW = new Date("2026-11-02T10:00:00.000Z");
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);

const row = (over: Partial<StoredStatus> = {}): StoredStatus => ({
  availability: "available",
  source: "manual",
  message: null,
  expiresAt: null,
  previousAvailability: null,
  previousMessage: null,
  revision: 1,
  changedAt: NOW,
  ...over,
});

describe("effectiveStatus", () => {
  it("defaults to Available for someone who never picked a status", () => {
    const e = effectiveStatus(null, NOW);
    expect(e).toMatchObject({
      availability: "available",
      source: "default",
      message: null,
      revision: 0,
    });
  });

  it("keeps a timed status until it ends", () => {
    const e = effectiveStatus(
      row({ availability: "lunch", expiresAt: later(30) }),
      NOW,
    );
    expect(e.availability).toBe("lunch");
    expect(e.expiresAt).toEqual(later(30));
  });

  it("reads an ended status as Available even before the expiry job runs", () => {
    const e = effectiveStatus(
      row({
        availability: "meeting",
        message: "Standup",
        expiresAt: later(-1),
      }),
      NOW,
    );
    expect(e).toMatchObject({
      availability: "available",
      source: "default",
      message: null,
      expiresAt: null,
    });
  });

  it("returns to the remembered untimed status when a timed one ends", () => {
    const e = effectiveStatus(
      row({
        availability: "lunch",
        expiresAt: later(-5),
        previousAvailability: "dnd",
        previousMessage: "Deep work",
      }),
      NOW,
    );
    expect(e).toMatchObject({
      availability: "dnd",
      message: "Deep work",
      source: "manual",
    });
  });
});

describe("applyChoice", () => {
  const eff = (over: Partial<StoredStatus> = {}) =>
    effectiveStatus(row(over), NOW);

  it("a timed status over Do Not Disturb remembers Do Not Disturb", () => {
    const next = applyChoice(
      eff({ availability: "dnd", message: "Heads down" }),
      { availability: "lunch", message: null },
      later(60),
    );
    expect(next.previous).toEqual({
      availability: "dnd",
      message: "Heads down",
    });
    expect(next.expiresAt).toEqual(later(60));
  });

  it("replacing a timed status keeps remembering the same untimed one", () => {
    const next = applyChoice(
      eff({
        availability: "lunch",
        expiresAt: later(20),
        previousAvailability: "busy",
      }),
      { availability: "meeting", message: null },
      later(60),
    );
    expect(next.previous).toEqual({ availability: "busy", message: null });
  });

  it("nothing is remembered over a plain default Available", () => {
    const next = applyChoice(
      effectiveStatus(null, NOW),
      { availability: "busy", message: null },
      later(30),
    );
    expect(next.previous).toBeNull();
  });

  it("an untimed change remembers the untimed status it replaced", () => {
    const next = applyChoice(
      eff({ availability: "busy" }),
      { availability: "focusing", message: null },
      null,
    );
    expect(next.previous).toEqual({ availability: "busy", message: null });
  });
});

describe("restorePrevious / withMessage", () => {
  it("goes back to the remembered status", () => {
    const next = restorePrevious(
      effectiveStatus(
        row({ availability: "focusing", previousAvailability: "busy" }),
        NOW,
      ),
    );
    expect(next).toMatchObject({ availability: "busy", previous: null });
  });

  it("goes back to Available when nothing is remembered", () => {
    const next = restorePrevious(
      effectiveStatus(row({ availability: "busy" }), NOW),
    );
    expect(next).toMatchObject({
      availability: "available",
      source: "default",
    });
  });

  it("changing the message keeps the status and its end time", () => {
    const next = withMessage(
      effectiveStatus(row({ availability: "busy", expiresAt: later(45) }), NOW),
      "Back at 3",
    );
    expect(next).toMatchObject({
      availability: "busy",
      message: "Back at 3",
      expiresAt: later(45),
    });
  });
});

describe("displayStatus", () => {
  it("an idle person who is Available shows as Away", () => {
    expect(displayStatus("available", "idle")).toBe("away");
  });

  it("a manual Busy stays Busy while idle", () => {
    expect(displayStatus("busy", "idle")).toBe("busy");
  });

  it("Do Not Disturb survives reconnecting (online)", () => {
    expect(displayStatus("dnd", "online")).toBe("dnd");
  });

  it("nobody connected shows Offline", () => {
    expect(displayStatus("busy", "offline")).toBe("offline");
  });
});

describe("aggregateConnectivity", () => {
  const t = NOW.getTime();
  it("any active tab or device makes the person online", () => {
    expect(
      aggregateConnectivity([`idle|${t}`, `active|${t}`], t, 100_000),
    ).toBe("online");
  });
  it("only idle connections make them idle", () => {
    expect(aggregateConnectivity([`idle|${t}`, `idle|${t}`], t, 100_000)).toBe(
      "idle",
    );
  });
  it("stale or missing connections make them offline", () => {
    expect(aggregateConnectivity([`active|${t - 200_000}`], t, 100_000)).toBe(
      "offline",
    );
    expect(aggregateConnectivity([], t, 100_000)).toBe("offline");
  });
});

describe("durations", () => {
  const workday = { startHour: 9, startMinute: 30, hours: 8 };

  it("end of workday is shift start + working hours in the person's zone", () => {
    // 10:00 UTC = 15:30 in Kolkata; the day ends at 17:30 IST = 12:00 UTC.
    expect(endOfWorkday(NOW, "Asia/Kolkata", workday).toISOString()).toBe(
      "2026-11-02T12:00:00.000Z",
    );
    // 10:00 UTC = 05:00 in New York (EST); ends 17:30 EST = 22:30 UTC.
    expect(endOfWorkday(NOW, "America/New_York", workday).toISOString()).toBe(
      "2026-11-02T22:30:00.000Z",
    );
  });

  it("after the workday it runs to the end of the local day instead", () => {
    const late = new Date("2026-11-02T14:00:00.000Z"); // 19:30 IST
    expect(endOfWorkday(late, "Asia/Kolkata", workday).toISOString()).toBe(
      "2026-11-02T18:29:59.999Z",
    );
  });

  it("fixed durations and until-changed", () => {
    expect(expiryFor("30m", NOW, "UTC", workday)).toEqual(later(30));
    expect(expiryFor("2h", NOW, "UTC", workday)).toEqual(later(120));
    expect(expiryFor("until_changed", NOW, "UTC", workday)).toBeNull();
  });

  it("validates time zones", () => {
    expect(isTimeZone("Asia/Kolkata")).toBe(true);
    expect(isTimeZone("Mars/Base")).toBe(false);
    expect(isTimeZone(42)).toBe(false);
  });
});

describe("cleanMessage / workModeFor", () => {
  it("makes messages one plain line within the limit", () => {
    expect(cleanMessage("  Working on\nthe report ‮ ")).toBe(
      "Working on the report",
    );
    expect(cleanMessage("   ")).toBeNull();
    expect(cleanMessage("x".repeat(400))).toHaveLength(140);
  });

  it("remote comes from approved WFH or attendance mode, never from availability", () => {
    expect(workModeFor("office", true)).toBe("remote");
    expect(workModeFor("remote", false)).toBe("remote");
    expect(workModeFor("field", false)).toBe("field");
    expect(workModeFor(undefined, false)).toBe("office");
  });
});

describe("presence schemas", () => {
  it("refuses a body naming another user or tenant", () => {
    expect(
      presenceUpdateSchema.safeParse({ availability: "busy", userId: "x" })
        .success,
    ).toBe(false);
    expect(
      presenceUpdateSchema.safeParse({ availability: "busy", tenantId: "x" })
        .success,
    ).toBe(false);
  });

  it("needs a status or a message, and a duration only with a status", () => {
    expect(presenceUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      presenceUpdateSchema.safeParse({ duration: "1h", message: "x" }).success,
    ).toBe(false);
    expect(presenceUpdateSchema.safeParse({ message: null }).success).toBe(
      true,
    );
    expect(
      presenceUpdateSchema.safeParse({ availability: "offline" }).success,
    ).toBe(false);
  });

  it("parses id lists and people queries", () => {
    const ok = presenceBatchQuerySchema.safeParse({
      ids: "65a1b2c3d4e5f60718293a4b,65a1b2c3d4e5f60718293a4c",
    });
    expect(ok.success && ok.data.ids).toHaveLength(2);
    expect(presenceBatchQuerySchema.safeParse({ ids: "nope" }).success).toBe(
      false,
    );
    const q = presencePeopleQuerySchema.parse({ status: "offline", page: "2" });
    expect(q).toMatchObject({
      scope: "team",
      status: "offline",
      page: 2,
      limit: 25,
    });
  });
});
