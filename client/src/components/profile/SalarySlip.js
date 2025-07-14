import { useContext, useState } from "react";
import { Calendar } from "primereact/calendar";
import { UserContext } from "../../contexts/UserContext";

function SalarySlip() {
  const { user } = useContext(UserContext);
  const [date, setDate] = useState(() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
  const [isDownloading, setIsDownloading] = useState(false);

  const maxSelectableDate = (() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  })();

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { default: downloadSalarySlip } = await import(
        "../../utils/downloadSalarySlip"
      );
      await downloadSalarySlip(date, user.username, setIsDownloading);
    } catch (error) {
      console.error("Error downloading salary slip:", error);
      setIsDownloading(false);
    }
  };

  return (
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
        maxDate={maxSelectableDate}
        showIcon
      />

      <button className="btn" onClick={handleDownload} disabled={isDownloading}>
        Download
      </button>
    </div>
  );
}

export default SalarySlip;
