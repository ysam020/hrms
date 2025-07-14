export const calculateMonthDetails = (
  year,
  month,
  currentDate,
  setDaysInMonth
) => {
  const firstDayOfMonth = (new Date(year, month, 1).getDay() + 6) % 7;
  const lastDateOfMonth = new Date(year, month + 1, 0).getDate(); // Get the last date of the month
  const prevMonthLastDate = new Date(year, month, 0).getDate(); // Last date of the previous month

  const daysInCurrentMonth = [];

  // Add the last days of the previous month
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    daysInCurrentMonth.push({
      day: prevMonthLastDate - i,
      isCurrentMonth: false,
    });
  }

  // Add the days of the current month
  for (let i = 1; i <= lastDateOfMonth; i++) {
    const isToday =
      i === currentDate.getDate() &&
      month === currentDate.getMonth() &&
      year === currentDate.getFullYear();
    daysInCurrentMonth.push({ day: i, isCurrentMonth: true, isToday });
  }

  // Add the first days of the next month to fill the calendar grid
  const remainingDays = 42 - daysInCurrentMonth.length;
  for (let i = 1; i <= remainingDays; i++) {
    daysInCurrentMonth.push({
      day: i,
      isCurrentMonth: false,
    });
  }

  setDaysInMonth(daysInCurrentMonth);
};
