import { useState, useContext, useCallback } from "react";
import AddHolidayForm from "./AddHolidayForm";
import ViewHolidays from "./ViewHolidays";
import { AlertContext } from "../../../contexts/AlertContext";
import apiClient from "../../../config/axiosConfig";

function Holidays() {
  const [data, setData] = useState([]);
  const [date, setDate] = useState(() => {
    const currentYear = new Date().getFullYear();
    return new Date(`${currentYear}-01-01`);
  });

  const { setAlert } = useContext(AlertContext);

  const getHolidays = useCallback(async () => {
    try {
      const selectedYear = date.getFullYear();
      const res = await apiClient(`/get-holidays/${selectedYear}`);
      setData(res.data);
    } catch (error) {
      setAlert({
        open: true,
        message: "Failed to fetch leave applications. Please try again.",
        severity: "error",
      });
    }
    // eslint-disable-next-line
  }, [date]);

  return (
    <div>
      <AddHolidayForm data={data} getHolidays={getHolidays} />
      <ViewHolidays
        getHolidays={getHolidays}
        date={date}
        setDate={setDate}
        data={data}
      />
    </div>
  );
}

export default Holidays;
