import { Calendar } from "primereact/calendar";

export const tableToolbarDate = (date, setDate) => {
  return {
    renderTopToolbarCustomActions: () => (
      <>
        <div>
          <Calendar
            value={date ? new Date(date + "-01") : null}
            onChange={(e) => {
              if (e.value) {
                const year = e.value.getFullYear();
                const month = String(e.value.getMonth() + 1).padStart(2, "0");
                setDate(`${year}-${month}`);
              } else {
                setDate("");
              }
            }}
            view="month"
            dateFormat="mm/yy"
            maxDate={new Date()}
            showIcon
          />
        </div>
      </>
    ),
  };
};
