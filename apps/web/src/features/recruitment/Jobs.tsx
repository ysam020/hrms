import dayjs from "dayjs";
import { useContext, useState } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import {
  useSharedElement,
  useTransitionNavigate,
  vtName,
  TransitionLink,
} from "@next/motion";
import {
  Button,
  DataTable,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  SegmentedControl,
  Status,
  type Column,
} from "@next/ui";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fmtMoney } from "@next/lib/format";
import { employmentTypeLabel, locationSummary } from "./jobConfig";

// Recruitment: job openings (GET /view-job-openings, same filters as
// Classic). Opening a job morphs its title into the detail header.

const jobPath = (j: any) => `/view-job-opening/${j.id || j._id}`;

function JobTitle({ j }: { j: any }) {
  const style = useSharedElement(vtName("job", j.id || j._id), jobPath(j));
  return (
    <PrimaryCell
      style={style}
      title={j.jobTitle}
      subtitle={
        [
          j.department,
          employmentTypeLabel(j.employmentType),
          locationSummary(j),
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
    />
  );
}

/** Apply By date plus how soon it closes; the last week is amber. */
function Deadline({ date }: { date?: string }) {
  if (!date) return <span className="px-tertiary">—</span>;
  const days = dayjs(date).startOf("day").diff(dayjs().startOf("day"), "day");
  const tone = days < 0 ? "neutral" : days <= 7 ? "warning" : undefined;
  return (
    <span style={{ display: "grid" }}>
      <span className="px-num">{fmtDate(date)}</span>
      <span
        className="px-meta"
        style={
          tone === "warning"
            ? { color: "var(--px-warning)", fontWeight: 500 }
            : undefined
        }
      >
        {days < 0
          ? "Closed"
          : days === 0
            ? "Closes today"
            : days === 1
              ? "Closes tomorrow"
              : `${days} days left`}
      </span>
    </span>
  );
}

export default function Jobs() {
  const { user } = useContext(UserContext);
  const navigate = useTransitionNavigate();
  const [status, setStatus] = useState("Active");
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.VIEW_JOB_OPENINGS(
        p,
        l,
        `${searchParam(q)}${status !== "All" ? `&status=${status}` : ""}`,
      ),
    {
      deps: [status],
      listKeys: ["jobOpenings", "jobs"],
    },
  );
  const columns: Column<any>[] = [
    {
      key: "title",
      header: "Role",
      priority: "primary",
      render: (j) => <JobTitle j={j} />,
    },
    {
      key: "vacancies",
      header: "Openings",
      align: "right",
      priority: "secondary",
      stackLabel: "Openings",
      render: (j) => (
        <span className="px-num" style={{ fontWeight: 600 }}>
          {j.numberOfVacancies ?? "—"}
        </span>
      ),
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      priority: "hidden",
      render: (j) =>
        Array.isArray(j.budget) ? (
          j.budget.length ? (
            <span
              className="px-num"
              title={
                j.budgetDisclosed === false
                  ? "Not shown on the careers page"
                  : undefined
              }
            >
              ₹{j.budget[0]}–{j.budget[1]} LPA
              {j.budgetDisclosed === false && (
                <span className="px-tertiary"> · internal</span>
              )}
            </span>
          ) : (
            <span className="px-tertiary">Not set</span>
          )
        ) : j.budget ? (
          fmtMoney(j.budget)
        ) : (
          <span className="px-tertiary">Not set</span>
        ),
    },
    {
      key: "deadline",
      header: "Apply By",
      priority: "secondary",
      stackLabel: "Apply by",
      render: (j) => <Deadline date={j.applicationDeadline} />,
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (j) => <Status value={j.status} />,
    },
  ];
  return (
    <Page
      title="Job Openings"
      description="Roles you’re hiring for. Open one to see its candidates and pipeline."
      actions={
        <>
          {user?.tenantSlug && (
            <a
              href={`/careers/${user.tenantSlug}`}
              target="_blank"
              rel="noopener"
            >
              <Button data-tour="jobs-careers" variant="plain" icon="external">
                Careers Page
              </Button>
            </a>
          )}
          {isHrOrAbove(user) && (
            <TransitionLink to="/job-openings/new">
              <Button data-tour="jobs-new" variant="primary" icon="plus">
                New Opening
              </Button>
            </TransitionLink>
          )}
        </>
      }
      tabs={
        <>
          <SegmentedControl
            role="radiogroup"
            label="Status"
            value={status}
            onChange={setStatus}
            segments={["Active", "Expired", "Hired", "All"].map((s) => ({
              value: s,
              label: s,
            }))}
          />
          <SearchField
            label="Search roles"
            value={list.query}
            onChange={(e) => list.search(e.target.value)}
            toolbarWidth={220}
            trailing
          />
        </>
      }
    >
      <DataTable
        label="Job openings"
        tour="jobs-table"
        columns={columns}
        rows={list.data}
        rowId={(j) => String(j.id || j._id)}
        loading={list.loading}
        onRowClick={(j) => navigate(jobPath(j))}
        stickyOffset={52}
        empty={{
          icon: "briefcase",
          title: list.query
            ? "No openings match your search"
            : `No ${status === "All" ? "" : status.toLowerCase() + " "}openings`,
          body: list.query
            ? "Try another role name or clear the search."
            : status === "Active"
              ? "Openings that are live and taking applications appear here."
              : undefined,
          action:
            !list.query && status === "Active" && isHrOrAbove(user) ? (
              <TransitionLink to="/job-openings/new">
                <Button icon="plus">New Opening</Button>
              </TransitionLink>
            ) : undefined,
        }}
        footer={<Pagination {...list.pageProps} />}
      />
    </Page>
  );
}
