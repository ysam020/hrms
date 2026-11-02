import { useState } from "react";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Avatar,
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
import { personName, type PersonNameFields } from "@next/lib/format";
import {
  TransitionLink,
  handOff,
  sharedPart,
  useTransitionNavigate,
  useTransitionWith,
} from "@next/motion";

// KYC overview over GET /view-all-kycs (the server scopes non-HR callers to
// their own record). Rows open the review page (/view-kyc/:username).

const STATUSES = [
  "All",
  "Pending",
  "Approved",
  "Rejected",
  "Revision Requested",
  "Edit Requested",
];

type KycRow = PersonNameFields & { username: string; kyc_approval?: string };

const reviewPath = (r: KycRow) => `/view-kyc/${encodeURIComponent(r.username)}`;

// The opened person's avatar and name carry over into the review header.
function KycPerson({ r }: { r: KycRow }) {
  const on = useTransitionWith(reviewPath(r));
  return (
    <PrimaryCell
      leading={
        <Avatar
          name={personName(r)}
          size={28}
          style={sharedPart("person", r.username, "avatar", on)}
        />
      }
      title={personName(r)}
      titleStyle={sharedPart("person", r.username, "title", on)}
      subtitle={r.username}
    />
  );
}

export default function Kyc() {
  const navigate = useTransitionNavigate();
  const [status, setStatus] = useState("All");
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.VIEW_ALL_KYCS(
        p,
        l,
        `${searchParam(q)}${status !== "All" ? `&status=${encodeURIComponent(status)}` : ""}`,
      ),
    { deps: [status], listKeys: ["kycs"] },
  );
  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Employee",
      priority: "primary",
      render: (r) => <KycPerson r={r} />,
    },
    {
      key: "dept",
      header: "Department",
      priority: "secondary",
      render: (r) => r.department || "—",
    },
    {
      key: "desig",
      header: "Designation",
      priority: "hidden",
      render: (r) => r.designation || "—",
    },
    {
      key: "kyc",
      header: "KYC",
      priority: "trailing",
      render: (r) => <Status value={r.kyc_approval || "Pending"} />,
    },
  ];
  return (
    <Page
      title="Employee KYC"
      actions={
        <TransitionLink to="/kyc/complete-kyc">
          <Button data-tour="kyc-complete" variant="primary" icon="idcard">
            Complete My KYC
          </Button>
        </TransitionLink>
      }
      tabs={
        <>
          <SegmentedControl
            role="radiogroup"
            label="Status"
            value={status}
            onChange={setStatus}
            segments={STATUSES.map((s) => ({ value: s, label: s }))}
          />
          <SearchField
            label="Search people"
            value={list.query}
            onChange={(e) => list.search(e.target.value)}
            toolbarWidth={220}
            trailing
          />
        </>
      }
    >
      <DataTable
        label="KYC records"
        tour="kyc-table"
        columns={columns}
        rows={list.data}
        rowId={(r) => r.username}
        loading={list.loading}
        onRowClick={(r) => {
          handOff("person", r.username, {
            username: r.username,
            first_name: r.first_name,
            last_name: r.last_name,
            fullName: r.fullName,
            name: r.name,
            kyc_approval: r.kyc_approval,
          });
          navigate(reviewPath(r));
        }}
        stickyOffset={52}
        empty={{ icon: "idcard", title: "No KYC records match" }}
        footer={<Pagination {...list.pageProps} />}
      />
    </Page>
  );
}
