import { useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate } from "@next/motion";
import {
  Button,
  DataTable,
  ErrorState,
  Field,
  KeyValues,
  KeyValuesSkeleton,
  Metric,
  Metrics,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  Section,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  type Column,
  type Tone,
} from "@next/ui";
import { apiClient, errorMessage, unwrap } from "@next/lib/api";
import { useDebouncedCallback } from "@next/lib/hooks";
import { fmtDate, fmtDateTime, fmtNumber, fromNow } from "@next/lib/format";
import {
  Note,
  RangeControl,
  canManageLeads,
  rangeLabel,
  useConsoleData,
  useRange,
} from "./shared";
import s from "./platformAdmin.module.css";

// Website sales leads (Book a Demo, Contact Sales). Contact details are
// shown only here, to people with PraestoAdmin:view_leads; changes need
// manage_leads. Every change is audited by the gateway.

export const LEAD_STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "accent" },
  contacted: { label: "Contacted", tone: "neutral" },
  qualified: { label: "Qualified", tone: "accent" },
  demo_scheduled: { label: "Demo Scheduled", tone: "warning" },
  negotiation: { label: "Negotiation", tone: "warning" },
  converted: { label: "Converted", tone: "success" },
  lost: { label: "Lost", tone: "danger" },
};
const leadStatus = (v?: string) =>
  LEAD_STATUS[v ?? ""] ?? { label: v || "Unknown", tone: "neutral" as Tone };

export const LEAD_KIND: Record<string, string> = {
  demo: "Demo Request",
  sales: "Sales Enquiry",
  custom: "Custom Solution",
};
const TIME_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};
const pctLabel = (v?: number | null) => (v == null ? "—" : `${v}%`);

type Filters = {
  status: string;
  kind: string;
  owner: string;
  from: string;
  to: string;
};
const NO_FILTERS: Filters = {
  status: "",
  kind: "",
  owner: "",
  from: "",
  to: "",
};
const PAGE_SIZE = 25;

function filterQuery(f: Filters, search: string, page: number) {
  const p = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
  });
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  if (f.from && f.to && f.from > f.to) {
    p.delete("from");
    p.delete("to");
  }
  if (search) p.set("search", search);
  return `?${p}`;
}

/** Funnel for the selected range: stage counts, conversion rates, channels. */
function Funnel() {
  const r = useRange();
  const { data, error, refetch } = useConsoleData(
    r.query ? API_ENDPOINTS.PLATFORM_ADMIN_LEAD_METRICS(r.query) : null,
  );
  const columns: Column<any>[] = [
    {
      key: "channel",
      header: "Channel",
      priority: "primary",
      render: (c) => <PrimaryCell title={c.channel} />,
    },
    {
      key: "leads",
      header: "Leads",
      align: "right",
      priority: "secondary",
      stackLabel: "Leads",
      render: (c) => <span className="px-num">{fmtNumber(c.leads)}</span>,
    },
    {
      key: "demos",
      header: "Demos",
      align: "right",
      priority: "secondary",
      stackLabel: "Demos",
      render: (c) => <span className="px-num">{fmtNumber(c.demos)}</span>,
    },
    {
      key: "converted",
      header: "Customers",
      align: "right",
      priority: "secondary",
      stackLabel: "Customers",
      render: (c) => <span className="px-num">{fmtNumber(c.converted)}</span>,
    },
    {
      key: "rate",
      header: "Lead → Customer",
      align: "right",
      priority: "trailing",
      render: (c) => (
        <span className="px-num">{pctLabel(c.conversionRate)}</span>
      ),
    },
  ];
  return (
    <Section
      title="Funnel"
      detail="Leads created in the period, by the furthest stage each one reached."
    >
      <div className={s.stack}>
        <RangeControl r={r} />
        {error && !data ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : (
          <>
            <Metrics label="Funnel">
              <Metric
                label="Leads"
                value={data ? fmtNumber(data.totals.leads) : "—"}
                note={data ? rangeLabel(data.range) : undefined}
              />
              <Metric
                label="Lead → Demo"
                value={pctLabel(data?.rates.leadToDemo)}
                note={
                  data
                    ? `${fmtNumber(data.totals.demos)} demo${data.totals.demos === 1 ? "" : "s"}`
                    : undefined
                }
              />
              <Metric
                label="Demo → Customer"
                value={pctLabel(data?.rates.demoToCustomer)}
                note="Of leads that had a demo"
              />
              <Metric
                label="Lead → Customer"
                value={pctLabel(data?.rates.leadToCustomer)}
                note={
                  data
                    ? `${fmtNumber(data.totals.converted)} converted`
                    : undefined
                }
              />
            </Metrics>
            <DataTable
              label="Leads by channel"
              columns={columns}
              rows={data?.channels ?? []}
              rowId={(c) => c.channel}
              loading={!data && !error}
              empty={{
                icon: "chart",
                title: "No leads in this period",
                body: "Leads from the website’s Book a Demo and Contact Sales forms appear here.",
              }}
            />
            <Note>
              Channel is the visitor’s utm_source, else the site that referred
              them, else “direct”. Website traffic (visitors, page views, CTA
              clicks) is in Google Analytics, which never receives lead details.
            </Note>
          </>
        )}
      </div>
    </Section>
  );
}

export default function PlatformLeads() {
  const navigate = useTransitionNavigate();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const applySearch = useDebouncedCallback((v: string) => {
    setSearch(v.trim());
    setPage(1);
  }, 300);
  const { data, error, loading, refetch } = useConsoleData(
    API_ENDPOINTS.PLATFORM_ADMIN_LEADS(filterQuery(filters, search, page)),
  );
  const owners = useConsoleData(API_ENDPOINTS.PLATFORM_ADMIN_LEAD_OWNERS);
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };
  const counts = data?.counts;

  const columns: Column<any>[] = [
    {
      key: "company",
      header: "Lead",
      priority: "primary",
      render: (l) => (
        <PrimaryCell
          title={l.companyName}
          subtitle={`${l.name} · ${l.companySize} employees`}
        />
      ),
    },
    {
      key: "kind",
      header: "Type",
      priority: "secondary",
      stackLabel: "Type",
      render: (l) => LEAD_KIND[l.kind] ?? l.kind,
    },
    {
      key: "channel",
      header: "Channel",
      priority: "hidden",
      render: (l) => l.channel,
    },
    {
      key: "owner",
      header: "Owner",
      priority: "secondary",
      stackLabel: "Owner",
      render: (l) =>
        l.ownerName ?? <span className="px-tertiary">Unassigned</span>,
    },
    {
      key: "follow",
      header: "Next Follow-Up",
      priority: "hidden",
      render: (l) => (l.nextFollowUpAt ? fmtDate(l.nextFollowUpAt) : "—"),
    },
    {
      key: "created",
      header: "Received",
      priority: "secondary",
      stackLabel: "Received",
      render: (l) => (
        <span title={fmtDateTime(l.createdAt)}>{fromNow(l.createdAt)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (l) => (
        <StatusBadge tone={leadStatus(l.status).tone}>
          {leadStatus(l.status).label}
        </StatusBadge>
      ),
    },
  ];

  return (
    <Page
      title="Leads"
      subtitle="Praesto Platform Console"
      description="Demo requests and sales enquiries from praesto.in. Contact details are visible only to people with lead access, and every change is recorded in the platform audit log."
      tabs={
        <SearchField
          label="Name, company or email"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            applySearch(e.target.value);
          }}
          toolbarWidth={300}
          trailing
        />
      }
    >
      <div className={s.stack}>
        <Metrics label="Leads by status">
          <Metric
            label="Total"
            value={counts ? fmtNumber(counts.total) : "—"}
          />
          <Metric label="New" value={counts ? fmtNumber(counts.new) : "—"} />
          <Metric
            label="Qualified"
            value={counts ? fmtNumber(counts.qualified) : "—"}
          />
          <Metric
            label="Demos Scheduled"
            value={counts ? fmtNumber(counts.demo_scheduled) : "—"}
          />
          <Metric
            label="Converted"
            value={counts ? fmtNumber(counts.converted) : "—"}
          />
        </Metrics>

        <div className={s.filters} role="group" aria-label="Filters">
          <Select
            aria-label="Status"
            value={filters.status}
            onChange={set("status")}
          >
            <option value="">All statuses</option>
            {Object.entries(LEAD_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Type" value={filters.kind} onChange={set("kind")}>
            <option value="">All types</option>
            {Object.entries(LEAD_KIND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Owner"
            value={filters.owner}
            onChange={set("owner")}
          >
            <option value="">Any owner</option>
            <option value="me">Mine</option>
            <option value="none">Unassigned</option>
            {(owners.data?.owners ?? []).map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <TextInput
            type="date"
            aria-label="Received from"
            value={filters.from}
            max={filters.to || undefined}
            onChange={set("from")}
          />
          <TextInput
            type="date"
            aria-label="Received to"
            value={filters.to}
            min={filters.from || undefined}
            onChange={set("to")}
          />
        </div>

        {error && !data ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : (
          <DataTable
            label="Leads"
            columns={columns}
            rows={data?.leads ?? []}
            rowId={(l) => String(l.id)}
            loading={loading && !data}
            onRowClick={(l) => navigate(`/platform-admin/leads/${l.id}`)}
            empty={{
              icon: "inbox",
              title: "No leads match",
              body: "Try another filter, or clear the search.",
            }}
            footer={
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={data?.total ?? 0}
                onPage={setPage}
              />
            }
          />
        )}

        <Funnel />
      </div>
    </Page>
  );
}

/** YYYY-MM-DD (IST) for a date input, from an ISO timestamp. */
const toDay = (iso?: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() + 330 * 60_000)
        .toISOString()
        .slice(0, 10)
    : "";
/** A date input's day → ISO at the start of that day in IST. */
const fromDay = (day: string) => (day ? `${day}T00:00:00+05:30` : null);

export function PlatformLeadDetail() {
  const { leadId = "" } = useParams();
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const manage = canManageLeads(user);
  const { data, error, refetch } = useConsoleData(
    API_ENDPOINTS.PLATFORM_ADMIN_LEAD(leadId),
  );
  const owners = useConsoleData(
    manage ? API_ENDPOINTS.PLATFORM_ADMIN_LEAD_OWNERS : null,
  );
  const [lead, setLead] = useState<any>(null);
  useEffect(() => {
    if (data) setLead(data);
  }, [data]);
  const [draft, setDraft] = useState({
    status: "",
    ownerId: "",
    lastContactedAt: "",
    nextFollowUpAt: "",
  });
  useEffect(() => {
    if (lead)
      setDraft({
        status: lead.status,
        ownerId: lead.ownerId ?? "",
        lastContactedAt: toDay(lead.lastContactedAt),
        nextFollowUpAt: toDay(lead.nextFollowUpAt),
      });
  }, [lead]);
  const [note, setNote] = useState("");

  const changes = lead
    ? {
        ...(draft.status !== lead.status && { status: draft.status }),
        ...(draft.ownerId !== (lead.ownerId ?? "") && {
          ownerId: draft.ownerId || null,
        }),
        ...(draft.lastContactedAt !== toDay(lead.lastContactedAt) && {
          lastContactedAt: fromDay(draft.lastContactedAt),
        }),
        ...(draft.nextFollowUpAt !== toDay(lead.nextFollowUpAt) && {
          nextFollowUpAt: fromDay(draft.nextFollowUpAt),
        }),
      }
    : {};
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    try {
      const res = await apiClient.patch(
        API_ENDPOINTS.PLATFORM_ADMIN_LEAD(leadId),
        changes,
      );
      setLead(unwrap(res));
      setAlert({ open: true, message: "Lead updated.", severity: "success" });
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };
  const addNote = async () => {
    try {
      const res = await apiClient.post(
        API_ENDPOINTS.PLATFORM_ADMIN_LEAD_NOTES(leadId),
        { body: note },
      );
      setLead(unwrap(res));
      setNote("");
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };
  const set = (k: keyof typeof draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const st = leadStatus(lead?.status);
  return (
    <Page
      title={lead?.companyName ?? "Lead"}
      subtitle="Praesto Platform Console"
      back={{ to: "/platform-admin/leads", label: "Leads" }}
    >
      {error && !lead ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !lead ? (
        <KeyValuesSkeleton rows={8} />
      ) : (
        <div className={s.stack}>
          <Metrics label="Summary">
            <Metric label="Status" value={st.label} tone={st.tone} />
            <Metric label="Type" value={LEAD_KIND[lead.kind] ?? lead.kind} />
            <Metric
              label="Received"
              value={fromNow(lead.createdAt)}
              note={
                lead.submissionCount > 1
                  ? `Submitted ${lead.submissionCount} times`
                  : fmtDateTime(lead.createdAt)
              }
            />
            <Metric
              label="Next Follow-Up"
              value={lead.nextFollowUpAt ? fmtDate(lead.nextFollowUpAt) : "—"}
              note={
                lead.lastContactedAt
                  ? `Last contacted ${fmtDate(lead.lastContactedAt)}`
                  : "Not contacted yet"
              }
            />
          </Metrics>

          <div className={s.detailGrid}>
            <Section title="Contact">
              <KeyValues
                items={[
                  ["Name", lead.name],
                  ["Email", <a href={`mailto:${lead.email}`}>{lead.email}</a>],
                  [
                    "Phone",
                    lead.phone ? (
                      <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                    ) : (
                      "—"
                    ),
                  ],
                  ["Designation", lead.designation ?? "—"],
                  ["Company", lead.companyName],
                  ["Company size", `${lead.companySize} employees`],
                  [
                    "Email type",
                    lead.freeEmailDomain
                      ? "Personal webmail"
                      : "Company domain",
                  ],
                ]}
              />
            </Section>

            <Section title="Request">
              <KeyValues
                items={[
                  ["Type", LEAD_KIND[lead.kind] ?? lead.kind],
                  [
                    "Preferred demo time",
                    lead.preferredDate
                      ? `${fmtDate(`${lead.preferredDate}T00:00:00+05:30`)}${
                          lead.preferredTime
                            ? `, ${TIME_LABEL[lead.preferredTime] ?? lead.preferredTime}`
                            : ""
                        } (IST)`
                      : "—",
                  ],
                  ["Message", lead.message ?? "—"],
                  ["Channel", lead.channel],
                  [
                    "Campaign",
                    [
                      lead.utmCampaign,
                      lead.utmMedium,
                      lead.utmContent,
                      lead.utmTerm,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—",
                  ],
                  ["Landing page", lead.landingPage ?? "—"],
                  ["Consent given", fmtDateTime(lead.consentAt)],
                ]}
              />
            </Section>
          </div>

          <Section
            title="Follow-Up"
            detail={
              manage
                ? undefined
                : "You can view leads. Changing them needs lead management access."
            }
          >
            <div className={s.filters} role="group" aria-label="Follow-up">
              <Field label="Status">
                <Select
                  value={draft.status}
                  onChange={set("status")}
                  disabled={!manage}
                >
                  {Object.entries(LEAD_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Owner">
                <Select
                  value={draft.ownerId}
                  onChange={set("ownerId")}
                  disabled={!manage}
                >
                  <option value="">Unassigned</option>
                  {lead.ownerId &&
                    !(owners.data?.owners ?? []).some(
                      (o: any) => o.id === lead.ownerId,
                    ) && (
                      <option value={lead.ownerId}>
                        {lead.ownerName ?? "Former owner"}
                      </option>
                    )}
                  {(owners.data?.owners ?? []).map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Last contacted">
                <TextInput
                  type="date"
                  value={draft.lastContactedAt}
                  onChange={set("lastContactedAt")}
                  disabled={!manage}
                />
              </Field>
              <Field label="Next follow-up">
                <TextInput
                  type="date"
                  value={draft.nextFollowUpAt}
                  onChange={set("nextFollowUpAt")}
                  disabled={!manage}
                />
              </Field>
            </div>
            {manage && (
              <div>
                <Button variant="primary" disabled={!dirty} onClick={save}>
                  Save Changes
                </Button>
              </div>
            )}
          </Section>

          <Section
            title="Notes"
            detail="Internal: never shown to the prospect."
          >
            <div className={s.stack}>
              {manage && (
                <>
                  <Field label="Add a note">
                    <TextArea
                      rows={3}
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                  <div>
                    <Button disabled={!note.trim()} onClick={addNote}>
                      Add Note
                    </Button>
                  </div>
                </>
              )}
              {lead.notes.length === 0 ? (
                <p className="px-meta">No notes yet.</p>
              ) : (
                <KeyValues
                  items={lead.notes.map((n: any) => [
                    <span title={fmtDateTime(n.createdAt)}>
                      {n.authorName} · {fromNow(n.createdAt)}
                    </span>,
                    <span style={{ whiteSpace: "pre-wrap" }}>{n.body}</span>,
                  ])}
                />
              )}
            </div>
          </Section>
        </div>
      )}
    </Page>
  );
}
