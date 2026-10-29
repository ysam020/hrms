import { useContext, useMemo, useState } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import {
  canManagePermissions,
  isHrOrAbove,
} from "@web/shared/utils/permissions/navAccess";
import { Collapse, TransitionLink } from "@next/motion";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Metric,
  Metrics,
  Page,
  SearchField,
  Skeleton,
} from "@next/ui";
import { useGet } from "@next/lib/hooks";
import s from "./org.module.css";

// Organization: GET /get-org-chart (CEO → team leaders → members, plus people
// not yet on a team) as an outline. Teams disclose in place; search filters
// people and expands the teams they belong to.

type Person = {
  id: string;
  name: string;
  username: string;
  designation: string | null;
  employeePhoto: string | null;
};

export default function OrgTree() {
  const { user } = useContext(UserContext);
  const { data, loading, error, refetch } = useGet<any>("/get-org-chart");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const canOpen = isHrOrAbove(user);
  const query = q.trim().toLowerCase();
  const match = (p?: Person | null) =>
    !query ||
    Boolean(
      p &&
      `${p.name} ${p.username} ${p.designation ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  const teams = useMemo(
    () =>
      (data?.teams ?? [])
        .map((t: any) => ({
          ...t,
          shown: t.members.filter(match),
          leaderMatch: match(t.leader),
        }))
        .filter(
          (t: any) =>
            !query ||
            t.leaderMatch ||
            t.shown.length ||
            t.teamName.toLowerCase().includes(query),
        ),
    [data, query], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const unassigned: Person[] = (data?.unassigned ?? []).filter(match);
  const b = data?.employeeStatusBreakdown ?? {};

  const PersonRow = ({ p, role }: { p: Person; role?: string }) => {
    const body = (
      <>
        <Avatar name={p.name} src={p.employeePhoto} size={32} />
        <span className={s.text}>
          <span className={s.name}>{p.name}</span>
          <span className={s.meta}>
            {[p.designation, role].filter(Boolean).join(" · ") || p.username}
          </span>
        </span>
      </>
    );
    return canOpen ? (
      <TransitionLink
        to={`/employee-management/${encodeURIComponent(p.username)}`}
        className={s.person}
      >
        {body}
        <Icon name="chevronRight" className={s.chev} />
      </TransitionLink>
    ) : (
      <div className={s.person}>{body}</div>
    );
  };

  return (
    <Page
      title="Organization"
      width="reading"
      tabs={
        <SearchField
          label="Find a person or team"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          toolbarWidth={300}
        />
      }
    >
      {loading ? (
        <div style={{ display: "grid", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={44} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data?.ceo && teams.length === 0 ? (
        <EmptyState
          icon="org"
          title="No organization structure yet"
          action={
            canManagePermissions(user) ? (
              <TransitionLink to="/permissions/teams">
                <Button>Set Up Teams</Button>
              </TransitionLink>
            ) : undefined
          }
        >
          Teams and their leads build the chart.
        </EmptyState>
      ) : (
        <div style={{ display: "grid", gap: 32 }}>
          <Metrics label="Headcount">
            <Metric label="Total" value={data.totalEmployeeCount ?? "—"} />
            <Metric label="Active" value={b.active ?? "—"} />
            <Metric label="Teams" value={(data.teams ?? []).length} />
            <Metric label="Unassigned" value={(data.unassigned ?? []).length} />
          </Metrics>
          <div>
            {data.ceo && match(data.ceo) && (
              <PersonRow p={data.ceo} role="Leads the organization" />
            )}
            <ul className={s.teams} data-root={data.ceo ? "" : undefined}>
              {teams.map((t: any) => {
                const expanded =
                  open.has(t._id) || Boolean(query && t.shown.length);
                return (
                  <li key={t._id} className={s.team}>
                    <button
                      type="button"
                      className={s.teamHead}
                      aria-expanded={expanded}
                      aria-controls={`team-${t._id}`}
                      onClick={() =>
                        setOpen((o) => {
                          const n = new Set(o);
                          if (n.has(t._id)) n.delete(t._id);
                          else n.add(t._id);
                          return n;
                        })
                      }
                    >
                      <Icon name="chevronRight" className={s.disclosure} />
                      <span className={s.teamName}>{t.teamName}</span>
                      <span className={s.count}>{t.members.length + 1}</span>
                    </button>
                    <div className={s.leader}>
                      <PersonRow p={t.leader} role="Team lead" />
                    </div>
                    <Collapse open={expanded} id={`team-${t._id}`}>
                      <ul className={s.members}>
                        {(query ? t.shown : t.members).map((m: Person) => (
                          <li key={m.id}>
                            <PersonRow p={m} />
                          </li>
                        ))}
                      </ul>
                    </Collapse>
                  </li>
                );
              })}
            </ul>
          </div>
          {unassigned.length > 0 && (
            <section>
              <h2 className="px-section" style={{ marginBottom: 8 }}>
                Not on a Team
              </h2>
              <ul>
                {unassigned.map((p) => (
                  <li key={p.id}>
                    <PersonRow p={p} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
