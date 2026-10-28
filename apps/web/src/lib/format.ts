import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

// Formatting matches Classic's conventions (en-IN money, "DD MMM YYYY").

export const fmtDate = (v?: string | number | Date | null) =>
  v ? dayjs(v).format("D MMM YYYY") : "—";
export const fmtDateShort = (v?: string | number | Date | null) =>
  v ? dayjs(v).format("D MMM") : "—";
export const fmtTime = (v?: string | number | Date | null) =>
  v ? dayjs(v).format("h:mm A") : "—";
export const fmtDateTime = (v?: string | number | Date | null) =>
  v ? dayjs(v).format("D MMM YYYY, h:mm A") : "—";
export const fromNow = (v?: string | number | Date | null) =>
  v ? dayjs(v).fromNow() : "";

export const fmtMoney = (n?: number | string | null, currency = "INR") => {
  const v = Number(n);
  if (n == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
};
export const fmtNumber = (n?: number | null) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("en-IN");

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export const personName = (u: any): string =>
  u?.fullName ||
  u?.name ||
  [u?.first_name ?? u?.firstName, u?.last_name ?? u?.lastName]
    .filter(Boolean)
    .join(" ") ||
  u?.username ||
  "Unknown";

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5
    ? "Good evening"
    : h < 12
      ? "Good morning"
      : h < 17
        ? "Good afternoon"
        : "Good evening";
}
