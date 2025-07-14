export const handleCalendarNavigation = (
  direction,
  month,
  year,
  setMonth,
  setYear
) => {
  let newMonth = month + direction;
  let newYear = year;

  if (newMonth < 0) {
    newMonth = 11;
    newYear -= 1;
  } else if (newMonth > 11) {
    newMonth = 0;
    newYear += 1;
  }

  setMonth(newMonth);
  setYear(newYear);
};
