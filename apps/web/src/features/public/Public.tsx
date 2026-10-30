import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { Icon, SearchField, ListSkeleton } from "@next/ui";
import { apiClient, asList } from "@next/lib/api";
import { locationSummary } from "@next/features/recruitment/jobConfig";
import { JobFacts, JobLocationLine, PublicBar, isOpen } from "./jobDisplay";
import s from "./public.module.css";

// Public careers pages (Classic's pages/CareersPage + JobApplicationPage) and
// the legal pages. The legal prose is Classic's own components, rendered in
// LegalLayout via the vite.config.ts import swap. The multi-step application
// lives in Apply.tsx.

export { default as PrivacyPolicyPage } from "@web/pages/legal/PrivacyPolicyPage";
export { default as TermsPage } from "@web/pages/legal/TermsOfUsePage";
export { default as RefundPolicyPage } from "@web/pages/legal/RefundPolicyPage";
export { JobApplicationPage } from "./Apply";

// ── Careers ─────────────────────────────────────────────────────────────────

export function CareersPage() {
  const { slug } = useParams();
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!slug) return setJobs([]);
    apiClient
      .get(API_ENDPOINTS.GET_ALL_JOB_OPENINGS(slug), {
        params: { status: "Active" },
      })
      .then((res) => setJobs(asList(res.data?.data ?? res.data)))
      .catch(() => setJobs([]));
  }, [slug]);

  const q = query.trim().toLowerCase();
  const shown = (jobs ?? []).filter(
    (j) =>
      isOpen(j) &&
      (!q ||
        j.jobTitle?.toLowerCase().includes(q) ||
        j.requiredSkills?.toLowerCase().includes(q)),
  );

  return (
    <div className={s.publicPage}>
      <PublicBar slug={slug} title="Careers" />
      <main className={s.careers}>
        <header className={s.hero}>
          <h1 className="px-display">Join Our Team</h1>
          <p className="px-secondary">
            Find a role that fits, and apply in a couple of minutes.
          </p>
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            label="Search by title, skill or location"
          />
        </header>
        {jobs === null ? (
          <ListSkeleton rows={3} trailing />
        ) : shown.length === 0 ? (
          <div className={s.emptyPublic}>
            <Icon name="briefcase" size={40} />
            <p className="px-headline">
              {q ? "No matching roles" : "No open roles right now"}
            </p>
            <p className="px-meta">
              {q
                ? "Try a different title, skill or place."
                : "Check back soon."}
            </p>
          </div>
        ) : (
          <ul className={s.jobs}>
            {shown.map((job) => {
              const id = job._id || job.id;
              return (
                <li key={id}>
                  <Link
                    to={`/careers/${slug}/apply/${id}`}
                    viewTransition
                    className={s.job}
                  >
                    <div className={s.jobHead}>
                      <div style={{ minWidth: 0 }}>
                        <h2 className="px-section">{job.jobTitle}</h2>
                        {job.department && (
                          <p className="px-meta">{job.department}</p>
                        )}
                        <JobLocationLine job={job} />
                      </div>
                      <span className={s.applyCue}>
                        Apply <Icon name="chevronRight" size={16} />
                      </span>
                    </div>
                    <JobFacts job={job} />
                    {job.jobDescription && (
                      <p className={s.clamp}>{job.jobDescription}</p>
                    )}
                    {job.requiredSkills && (
                      <p className="px-meta">Skills: {job.requiredSkills}</p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
