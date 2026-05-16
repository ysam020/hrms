import { useCallback, useMemo } from "react";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

export const useAttendanceData = (attendances, loading) => {
  const todayAttendance = useMemo(() => {
    const currentDate = new Date().setHours(0, 0, 0, 0);
    return attendances?.find((attendance) => {
      const attendanceDate = new Date(attendance.date).setHours(0, 0, 0, 0);
      return attendanceDate === currentDate;
    });
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
