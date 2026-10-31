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

/**
 * Display text stored in ALL CAPS ("FULL STACK DEVELOPER") in readable case
 * ("Full Stack Developer"). Short all-letter words (HR, IT, QA, CEO) stay as
 * acronyms. Mixed-case text is returned untouched, so names someone typed
 * deliberately ("McDonald", "iOS") are never altered. Display only — never
 * use it on values sent back to the server.
 */
export function readableCase(v?: string | null): string {
  const s = (v ?? "").trim();
  if (!s || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return v ?? "";
  return s
    .toLowerCase()
    .replace(/[a-z0-9]+/g, (w) =>
      w.length <= 3 &&
      [
        "hr",
        "it",
        "qa",
        "ceo",
        "cto",
        "cfo",
        "coo",
        "vp",
        "ui",
        "ux",
        "seo",
      ].includes(w)
        ? w.toUpperCase()
        : w[0].toUpperCase() + w.slice(1),
    );
}
