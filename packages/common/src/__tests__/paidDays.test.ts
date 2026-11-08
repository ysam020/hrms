import {
  computeMonthlyPaidDays,
  isPaidLeaveType,
  ledgerUsedPLFor,
  type PaidDaysInput,
} from "../paidDays";

// September 2026: 30 days, starts on a Tuesday, 22 weekdays, 8 weekend days.
const YEAR = 2026;
const MONTH = 9;
const d = (day: number, month = MONTH) =>
  new Date(Date.UTC(YEAR, month - 1, day));
const isWeekday = (day: number) => ![0, 6].includes(d(day).getUTCDay());
const WEEKDAYS = Array.from({ length: 30 }, (_, i) => i + 1).filter(isWeekday);

const present = (...skip: number[]) =>
  WEEKDAYS.filter((x) => !skip.includes(x)).map((day) => ({
    date: d(day),
    status: "Present",
  }));

const run = (over: Partial<PaidDaysInput>) =>
  computeMonthlyPaidDays({
    year: YEAR,
    month: MONTH,
    workingDays: [1, 2, 3, 4, 5],
    holidayDateKeys: new Set(),
    attendance: present(),
    ...over,
  });

const leave = (from: Date, to: Date, over: object = {}) => ({
  from,
  to,
  leaveType: "CL",
  status: "Approved",
  ...over,
});

describe("baseline", () => {
  it("pays the full month for full attendance", () => {
    expect(run({}).paidDays).toBe(30);
  });

  it("treats unexplained gaps as loss of pay", () => {
    const r = run({ attendance: present(8, 9, 10) });
    expect(r.paidDays).toBe(27);
    expect(r.lopDays).toBe(3);
  });
});

describe("approved leave", () => {
  it.each(["CL", "SL", "EL", "PL", "Maternity Leave", "Bereavement"])(
    "pays approved %s",
    (leaveType) => {
      const r = run({
        attendance: present(8, 9),
        leaves: [leave(d(8), d(9), { leaveType })],
      });
      expect(r.paidDays).toBe(30);
      expect(r.paidLeaves).toBe(2);
    },
  );

  it.each(["LWP", "lwp", "Leave Without Pay", "Unpaid Leave"])(
    "does not pay %s",
    (leaveType) => {
      const r = run({
        attendance: present(8, 9),
        leaves: [leave(d(8), d(9), { leaveType })],
      });
      expect(r.paidDays).toBe(28);
      expect(r.unpaidLeaves).toBe(2);
    },
  );

  it.each(["Pending", "Rejected", "Cancelled"])(
    "ignores %s leave",
    (status) => {
      const r = run({
        attendance: present(8, 9),
        leaves: [leave(d(8), d(9), { status })],
      });
      expect(r.paidDays).toBe(28);
    },
  );

  it("still pays leave awaiting cancellation approval", () => {
    const r = run({
      attendance: present(8),
      leaves: [leave(d(8), d(8), { status: "Cancellation Requested" })],
    });
    expect(r.paidDays).toBe(30);
  });

  it("honours a policy marking a type unpaid or paid", () => {
    const attendance = present(8);
    const leaves = [leave(d(8), d(8), { leaveType: "Sabbatical" })];
    const unpaid = [{ key: "Sabbatical", isPaid: false }];
    expect(run({ attendance, leaves, policies: unpaid }).paidDays).toBe(29);
    expect(isPaidLeaveType("LWP", [{ key: "LWP", isPaid: true }])).toBe(true);
  });
});

describe("partial days", () => {
  it("adds a paid half-day to a Half Day attendance", () => {
    const attendance = [...present(8), { date: d(8), status: "Half Day" }];
    const r = run({
      attendance,
      leaves: [leave(d(8), d(8), { unit: "half_day", session: "first_half" })],
    });
    expect(r.paidDays).toBe(30);
  });

  it("pays only the half-day when nothing else was recorded", () => {
    const r = run({
      attendance: present(8),
      leaves: [leave(d(8), d(8), { unit: "half_day", session: "first_half" })],
    });
    expect(r.paidDays).toBe(29.5);
  });

  it("two different halves make one day", () => {
    const r = run({
      attendance: present(8),
      leaves: [
        leave(d(8), d(8), { unit: "half_day", session: "first_half" }),
        leave(d(8), d(8), { unit: "half_day", session: "second_half" }),
      ],
    });
    expect(r.paidDays).toBe(30);
  });

  it("two applications for the same half count once", () => {
    const half = { unit: "half_day", session: "first_half" };
    const r = run({
      attendance: present(8),
      leaves: [leave(d(8), d(8), half), leave(d(8), d(8), half)],
    });
    expect(r.paidDays).toBe(29.5);
  });

  it("credits short leave by hours", () => {
    const r = run({
      attendance: present(8),
      leaves: [leave(d(8), d(8), { unit: "short_leave", shortLeaveHours: 2 })],
    });
    expect(r.paidDays).toBe(29.25);
  });
});

describe("no double payment", () => {
  it("pays once for leave on a day also attended", () => {
    const r = run({ leaves: [leave(d(8), d(8))] });
    expect(r.paidDays).toBe(30);
    expect(r.paidLeaves).toBe(0);
  });

  it("pays once for duplicate attendance rows", () => {
    const r = run({
      attendance: [...present(8), { date: d(9), status: "Present" }],
    });
    expect(r.present).toBe(21);
    expect(r.paidDays).toBe(29);
  });

  it("keeps the higher credit when duplicates disagree", () => {
    const r = run({
      attendance: [
        ...present(8),
        { date: d(8), status: "Half Day" },
        { date: d(8), status: "Present" },
      ],
    });
    expect(r.paidDays).toBe(30);
  });

  it("pays once for duplicate leave applications", () => {
    const r = run({
      attendance: present(8),
      leaves: [leave(d(8), d(8)), leave(d(8), d(8))],
    });
    expect(r.paidDays).toBe(30);
    expect(r.paidLeaves).toBe(1);
  });

  it("does not add the legacy ledger to the same days", () => {
    const r = run({
      attendance: present(8, 9),
      leaves: [leave(d(8), d(9))],
      ledgerUsedPL: 2,
    });
    expect(r.paidLeaves).toBe(2);
    expect(r.paidDays).toBe(30);
  });

  it("uses the ledger alone when no applications exist", () => {
    const r = run({ attendance: present(8, 9), ledgerUsedPL: 2 });
    expect(r.paidDays).toBe(30);
  });

  it("never exceeds the days in the month", () => {
    expect(run({ ledgerUsedPL: 40 }).paidDays).toBe(30);
  });
});

describe("holidays and weekly offs", () => {
  it("earns nothing extra for leave over a weekend", () => {
    // Sep 11 (Fri) to Sep 14 (Mon) spans a weekend.
    const r = run({
      attendance: present(11, 14),
      leaves: [leave(d(11), d(14))],
    });
    expect(r.paidLeaves).toBe(2);
    expect(r.paidDays).toBe(30);
  });

  it("earns nothing extra for leave over a holiday", () => {
    const r = run({
      attendance: present(8, 9),
      holidayDateKeys: new Set(["2026-09-09"]),
      leaves: [leave(d(8), d(9))],
    });
    expect(r.paidLeaves).toBe(1);
    expect(r.paidDays).toBe(30);
  });

  it("does not double count an explicit Week Off record", () => {
    const sat = WEEKDAYS.length ? d(5) : d(5);
    const r = run({
      attendance: [...present(), { date: sat, status: "Week Off" }],
    });
    expect(r.weekOff).toBe(8);
    expect(r.paidDays).toBe(30);
  });

  it("respects a six-day work week", () => {
    const r = run({
      workingDays: [1, 2, 3, 4, 5, 6],
      attendance: present(),
      leaves: [leave(d(5), d(5))],
    });
    expect(r.paidLeaves).toBe(1);
  });
});

describe("month and employment boundaries", () => {
  it("counts only the days of a leave inside the month", () => {
    const r = run({
      attendance: present(1, 2),
      leaves: [leave(d(31, 8), d(2))],
    });
    expect(r.paidLeaves).toBe(2);
    expect(r.paidDays).toBe(30);
  });

  it("does not credit weekends or leave before joining", () => {
    const r = run({
      attendance: present().filter((a) => a.date >= d(16)),
      leaves: [leave(d(8), d(9))],
      startDay: 16,
    });
    expect(r.paidLeaves).toBe(0);
    expect(r.paidDays).toBe(15);
  });

  it("does not credit weekends or leave after exit", () => {
    const r = run({
      attendance: present().filter((a) => a.date <= d(15)),
      leaves: [leave(d(21), d(22))],
      endDay: 15,
    });
    expect(r.paidLeaves).toBe(0);
    expect(r.paidDays).toBe(15);
  });
});

describe("determinism", () => {
  it("gives the same result regardless of input order", () => {
    const leaves = [leave(d(8), d(8)), leave(d(9), d(9), { leaveType: "LWP" })];
    const a = run({ attendance: present(8, 9), leaves });
    const b = run({
      attendance: present(8, 9).reverse(),
      leaves: [...leaves].reverse(),
    });
    expect(a).toEqual(b);
  });
});

describe("ledgerUsedPLFor", () => {
  const balances = [{ year: 2026, month: 9, usedPL: 3 }];
  it("finds the month", () => {
    expect(ledgerUsedPLFor(balances, 2026, 9)).toBe(3);
  });
  it("is zero for other months and other shapes", () => {
    expect(ledgerUsedPLFor(balances, 2026, 8)).toBe(0);
    expect(ledgerUsedPLFor({ PL: 5 }, 2026, 9)).toBe(0);
    expect(ledgerUsedPLFor(null, 2026, 9)).toBe(0);
  });
});
