import { useCallback, useMemo } from "react";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

const toUtcDateKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export const useAttendanceData = (attendances, loading) => {
  const todayAttendance = useMemo(() => {
    const currentDateKey = new Date().toISOString().slice(0, 10);
    return attendances?.find(
      (attendance) => toUtcDateKey(attendance.date) === currentDateKey,
    );
  }, [attendances]);

  const todayTimeIn = todayAttendance?.checkIn
    ? formatTime(todayAttendance.checkIn)
    : "";
  const todayTimeOut = todayAttendance?.checkOut
    ? formatTime(todayAttendance.checkOut)
    : "";

  const disableFields = useMemo(
    () => ({
      timeIn: !!todayTimeIn,
      timeOut: !!todayTimeOut,
    }),
    [todayTimeIn, todayTimeOut],
  );

  const getStatus = useCallback(() => {
    if (todayTimeIn && todayTimeOut)
      return { text: "Complete", color: "success" };
    if (todayTimeIn) return { text: "Checked In", color: "warning" };
    return { text: "Not Started", color: "default" };
  }, [todayTimeIn, todayTimeOut]);

  return {
    attendances,
    loading,
    todayTimeIn,
    todayTimeOut,
    disableFields,
    getStatus,
  };
};
