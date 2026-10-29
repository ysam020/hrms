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
        [j.department, j.location].filter(Boolean).join(" · ") || undefined
      }
    />
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
        <span className="px-num">{j.numberOfVacancies ?? "—"}</span>
      ),
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      priority: "hidden",
      render: (j) => (j.budget ? fmtMoney(j.budget) : "—"),
    },
    {
      key: "deadline",
      header: "Apply By",
      priority: "secondary",
      stackLabel: "Apply by",
      render: (j) => (
        <span className="px-num">{fmtDate(j.applicationDeadline)}</span>
      ),
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
      actions={
        <>
          {user?.tenantSlug && (
            <a
              href={`/careers/${user.tenantSlug}`}
              target="_blank"
              rel="noopener"
            >
              <Button variant="plain" icon="external">
                Careers Page
              </Button>
            </a>
          )}
          {isHrOrAbove(user) && (
            <TransitionLink to="/job-openings/new">
              <Button variant="primary" icon="plus">
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
        columns={columns}
        rows={list.data}
        rowId={(j) => String(j.id || j._id)}
        loading={list.loading}
        onRowClick={(j) => navigate(jobPath(j))}
        stickyOffset={52}
        empty={{
          icon: "briefcase",
          title: `No ${status === "All" ? "" : status.toLowerCase() + " "}openings`,
        }}
        footer={<Pagination {...list.pageProps} />}
      />
    </Page>
  );
}
