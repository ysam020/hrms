import { renderHook } from "@testing-library/react";
import { useAttendanceData } from "@web/shared/hooks/useAttendanceData";

const today = new Date();
const todayISO = today.toISOString();

const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayISO = yesterday.toISOString();

const makeAttendance = (
  date: string,
  timeIn: string = "",
  timeOut: string = "",
) => ({ date, timeIn, timeOut });

describe("useAttendanceData – todayAttendance resolution", () => {
  it("finds today's attendance from the array", () => {
    const att = makeAttendance(todayISO, "09:00", "18:00");
    const { result } = renderHook(() => useAttendanceData([att], false));
    expect(result.current.todayTimeIn).toBe("09:00");
    expect(result.current.todayTimeOut).toBe("18:00");
  });

  it("returns empty strings when no record matches today", () => {
    const att = makeAttendance(yesterdayISO, "09:00", "18:00");
    const { result } = renderHook(() => useAttendanceData([att], false));
    expect(result.current.todayTimeIn).toBe("");
    expect(result.current.todayTimeOut).toBe("");
  });

  it("returns empty strings for an empty attendances array", () => {
    const { result } = renderHook(() => useAttendanceData([], false));
    expect(result.current.todayTimeIn).toBe("");
    expect(result.current.todayTimeOut).toBe("");
  });

  it("handles null attendances gracefully (uses optional chaining)", () => {
    const { result } = renderHook(() => useAttendanceData(null, false));
    expect(result.current.todayTimeIn).toBe("");
    expect(result.current.todayTimeOut).toBe("");
  });

  it("ignores yesterday's record and finds today's", () => {
    const atts = [
      makeAttendance(yesterdayISO, "08:00", "17:00"),
      makeAttendance(todayISO, "09:30", "18:30"),
    ];
    const { result } = renderHook(() => useAttendanceData(atts, false));
    expect(result.current.todayTimeIn).toBe("09:30");
    expect(result.current.todayTimeOut).toBe("18:30");
  });
});

describe("useAttendanceData – getStatus", () => {
  it("returns 'Complete' when both timeIn and timeOut are set", () => {
    const att = makeAttendance(todayISO, "09:00", "18:00");
    const { result } = renderHook(() => useAttendanceData([att], false));
    expect(result.current.getStatus()).toEqual({
      text: "Complete",
      color: "success",
    });
  });

  it("returns 'Checked In' when only timeIn is set", () => {
    const att = makeAttendance(todayISO, "09:00", "");
    const { result } = renderHook(() => useAttendanceData([att], false));
    expect(result.current.getStatus()).toEqual({
      text: "Checked In",
      color: "warning",
    });
  });

  it("returns 'Not Started' when neither timeIn nor timeOut is set", () => {
    const { result } = renderHook(() => useAttendanceData([], false));
    expect(result.current.getStatus()).toEqual({
      text: "Not Started",
      color: "default",
    });
  });

  it("returns 'Not Started' when today's record has no times", () => {
    const att = makeAttendance(todayISO, "", "");
    const { result } = renderHook(() => useAttendanceData([att], false));
    expect(result.current.getStatus()).toEqual({
      text: "Not Started",
      color: "default",
    });
  });
});

describe("useAttendanceData – disableFields", () => {
  it("disableFields.timeIn is true when todayTimeIn is set", () => {
    const att = makeAttendance(todayISO, "09:00", "");
    const { result } = renderHook(() => useAttendanceData([att], false));
    expect(result.current.disableFields.timeIn).toBe(true);
    expect(result.current.disableFields.timeOut).toBe(false);
  });

  it("disableFields.timeOut is true when todayTimeOut is set", () => {
    const att = makeAttendance(todayISO, "09:00", "18:00");
    const { result } = renderHook(() => useAttendanceData([att], false));
    expect(result.current.disableFields.timeIn).toBe(true);
    expect(result.current.disableFields.timeOut).toBe(true);
  });

  it("both disableFields are false when no today's record exists", () => {
    const { result } = renderHook(() => useAttendanceData([], false));
    expect(result.current.disableFields.timeIn).toBe(false);
    expect(result.current.disableFields.timeOut).toBe(false);
  });
});

describe("useAttendanceData – passthrough values", () => {
  it("passes through the original attendances array", () => {
    const atts = [makeAttendance(todayISO, "09:00", "18:00")];
    const { result } = renderHook(() => useAttendanceData(atts, false));
    expect(result.current.attendances).toBe(atts);
  });

  it("passes through loading=true", () => {
    const { result } = renderHook(() => useAttendanceData([], true));
    expect(result.current.loading).toBe(true);
  });

  it("passes through loading=false", () => {
    const { result } = renderHook(() => useAttendanceData([], false));
    expect(result.current.loading).toBe(false);
  });
});
