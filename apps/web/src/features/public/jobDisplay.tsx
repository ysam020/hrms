import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon, Tag, type Tone } from "@next/ui";
import {
  employmentTypeLabel,
  experienceLabel,
  locationSummary,
} from "@next/features/recruitment/jobConfig";
import s from "./public.module.css";

// Pieces shared by the public careers list and the apply page.

const budgetRange = (b?: number[]) =>
  b?.[0] != null && b?.[1] ? `₹${b[0]}–${b[1]} LPA` : null;
const deadline = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

// Mirrors the gateway's isPastDeadline: "Apply by" a date means through the
// end of that day, and the stored value is that day's midnight.
const DAY_MS = 24 * 60 * 60 * 1000;
const daysLeft = (d?: string) =>
  d ? (new Date(d).getTime() + DAY_MS - Date.now()) / DAY_MS : Infinity;
export const isOpen = (job: any) => daysLeft(job.applicationDeadline) > 0;

export function JobFacts({ job }: { job: any }) {
  const left = daysLeft(job.applicationDeadline);
  const facts: [string | null, Tone][] = [
    [employmentTypeLabel(job.employmentType) || null, "neutral"],
    [
      job.numberOfVacancies
        ? `${job.numberOfVacancies} ${job.numberOfVacancies === 1 ? "opening" : "openings"}`
        : null,
      "accent",
    ],
    [experienceLabel(job), "warning"],
    // The gateway only sends a budget the organisation chose to disclose.
    [budgetRange(job.budget), "success"],
    [
      deadline(job.applicationDeadline) &&
        `Apply by ${deadline(job.applicationDeadline)}`,
      left <= 7 ? "danger" : "neutral",
    ],
  ];
  return (
    <ul className="px-row" style={{ gap: 6 }}>
      {facts.map(([f, tone]) =>
        f ? (
          <li key={f}>
            <Tag tone={tone}>{f}</Tag>
          </li>
        ) : null,
      )}
    </ul>
  );
}

export function JobLocationLine({ job }: { job: any }) {
  const where = locationSummary(job);
  if (!where) return null;
  return (
    <p className={`px-meta ${s.where}`}>
      <Icon name="pin" size={14} />
      {where}
    </p>
  );
}

export function PublicBar({ slug, title }: { slug?: string; title: string }) {
  useEffect(() => {
    document.title = `${title} · Praesto`;
  }, [title]);
  return (
    <header className={s.publicBar}>
      {slug ? (
        <Link to={`/careers/${slug}`} viewTransition className={s.brand}>
          <span className={s.glyph}>P</span> Careers
        </Link>
      ) : (
        <span className={s.brand}>
          <span className={s.glyph}>P</span> Careers
        </span>
      )}
    </header>
  );
}
