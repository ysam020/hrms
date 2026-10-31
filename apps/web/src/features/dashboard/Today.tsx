import dayjs from "dayjs";
import { useContext, useMemo, useState, type ReactNode } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { ApprovalsBadgeContext } from "@web/app/providers/ApprovalsBadgeContext";
import { useAttendanceData } from "@web/shared/hooks/useAttendanceData";
import { StaggerList, TransitionLink } from "@next/motion";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Page,
  Section,
  Skeleton,
} from "@next/ui";
import { fmtTime, greeting, plural } from "@next/lib/format";
import { ApprovalRow } from "../approvals/ApprovalRow";
import { useDecision } from "../approvals/decision";
import { useDashboardConfig, useWidgetData, type LayoutEntry } from "./data";
import { Agenda, Announcements, YourDay, usePersonalData } from "./personal";
import { HEADER_LINK, REGISTRY } from "./registry";
import { OnboardingCard } from "@next/walkthrough/Launcher";
import { Customize } from "./Customize";
import s from "./Today.module.css";
import d from "./dashboard.module.css";

// Today — a briefing built for the person looking at it.
//
// The server decides which widgets this person may use and their default
// arrangement (by what they can do: their own work, a team they lead, people
// operations, hiring, payroll, running the organisation — see
// docs/dashboard-role-matrix.md). People can then hide, reorder, resize and
// configure their widgets under Customize. Composition, top to bottom:
//   1. Greeting and a one-sentence brief built from real counts.
//   2. The person's widgets, in their order, on a two-column grid
//      (one column on narrow screens); "wide" widgets span both.

export default function Today() {
  const { user } = useContext(UserContext);
  const cfg = useDashboardConfig();
  const [customizing, setCustomizing] = useState(false);

  const available = useMemo(
    () => new Map((cfg.config?.widgets ?? []).map((w) => [w.id, w])),
    [cfg.config?.widgets],
  );
  const shown = useMemo(
    () =>
      (cfg.config?.layout ?? []).filter(
        (e) => e.visible && available.has(e.id) && REGISTRY[e.id],
      ),
    [cfg.config?.layout, available],
  );
  const server = shown.filter((e) => available.get(e.id)?.source === "server");
  // Sorted, so reordering widgets doesn't refetch their data.
  const live = server
    .filter((e) => REGISTRY[e.id].refresh === "live")
    .map((e) => e.id)
    .sort();
  const slow = server
    .filter((e) => REGISTRY[e.id].refresh !== "live")
    .map((e) => e.id)
    .sort();
  const widgetData = useWidgetData(live, slow, String(cfg.savedVersion));

  const ids = new Set(shown.map((e) => e.id));
  const parts = [
    ...(ids.has("my-day") ? (["day"] as const) : []),
    ...(ids.has("agenda") ? (["agenda"] as const) : []),
    ...(ids.has("announcements") ? (["announcements"] as const) : []),
  ];
  const personal = usePersonalData(user, parts);

  return (
    <Page
      title="Today"
      documentTitle="Today"
      largeTitle
      actions={
        cfg.config && (
          <Button
            size="small"
            icon="edit"
            onClick={() => setCustomizing(true)}
            aria-haspopup="dialog"
            data-tour="today-customize"
          >
            Customize
          </Button>
        )
      }
    >
      <Hero personal={personal} showDay={ids.has("my-day")} />
      <OnboardingCard />

      {cfg.stale && (
        <Banner tone="warning" icon="info">
          You’re offline. This is the dashboard as it was when you were last
          connected.
        </Banner>
      )}

      {!cfg.config ? (
        cfg.error ? (
          <ErrorState message={cfg.error} onRetry={() => void cfg.reload()} />
        ) : (
          <div className={`${d.wrap} ${d.grid}`} aria-busy>
            <div className={d.cell} data-size="wide">
              <Skeleton height={180} />
            </div>
            <div className={d.cell}>
              <Skeleton height={160} />
            </div>
            <div className={d.cell}>
              <Skeleton height={160} />
            </div>
          </div>
        )
      ) : shown.length === 0 ? (
        <EmptyState
          icon="today"
          title="Your dashboard is empty"
          action={
            <Button variant="primary" onClick={() => setCustomizing(true)}>
              Choose Widgets
            </Button>
          }
        >
          Pick what you’d like to see here.
        </EmptyState>
      ) : (
        <div className={d.wrap} data-tour="today-widgets">
          <div className={d.grid}>
            {shown.map((entry) => (
              <WidgetCell
                key={entry.id}
                entry={entry}
                personal={personal}
                widgetData={widgetData}
              />
            ))}
          </div>
        </div>
      )}

      {cfg.config && (
        <Customize
          open={customizing}
          onClose={() => {
            setCustomizing(false);
            void cfg.flush();
          }}
          config={cfg.config}
          saving={cfg.saving}
          onChange={cfg.update}
          onReset={cfg.reset}
        />
      )}
    </Page>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

function Hero({
  personal,
  showDay,
}: {
  personal: ReturnType<typeof usePersonalData>;
  showDay: boolean;
}) {
  const { user } = useContext(UserContext);
  const { pendingApprovalItems, loadingPendingApprovals } = useContext(
    ApprovalsBadgeContext,
  );
  const attendance = useAttendanceData(
    personal.data.attendances,
    personal.loading,
  );
  const firstName =
    user?.first_name ||
    user?.firstName ||
    (user?.fullName || "").split(" ")[0] ||
    "there";
  const celebrations = (
    Array.isArray(personal.data.people) ? personal.data.people : []
  ).filter((b: any) => b.day === dayjs().date());

  const brief: ReactNode[] = [];
  if (showDay && !personal.loading) {
    brief.push(
      attendance.todayTimeIn ? (
        attendance.todayTimeOut ? (
          <>You’ve wrapped up for today</>
        ) : (
          <>
            You’ve been in since <b>{attendance.todayTimeIn}</b>
          </>
        )
      ) : (
        <>You haven’t punched in yet</>
      ),
    );
  }
  if (!loadingPendingApprovals && pendingApprovalItems.length > 0)
    brief.push(
      <>
        <a href="#w-approvals">
          {plural(pendingApprovalItems.length, "request")}
        </a>{" "}
        need your decision
      </>,
    );
  if (celebrations.length > 0)
    brief.push(<>{plural(celebrations.length, "colleague")} celebrate today</>);

  const waiting = (showDay && personal.loading) || loadingPendingApprovals;
  return (
    <header className={s.hero} data-tour="today-hero">
      <p className={s.eyebrow}>{dayjs().format("dddd, D MMMM")}</p>
      <p className={s.greeting}>
        {greeting()}, {firstName}.
      </p>
      <p className={s.brief} aria-live="polite">
        {brief.length === 0 ? (
          waiting ? (
            <Skeleton width={320} height={18} />
          ) : null
        ) : (
          brief.map((b, i) => (
            <span key={i}>
              {i > 0 ? " · " : ""}
              {b}
            </span>
          ))
        )}
        {brief.length > 0 && "."}
      </p>
    </header>
  );
}

// ── A widget on the grid ────────────────────────────────────────────────────

function WidgetCell({
  entry,
  personal,
  widgetData,
}: {
  entry: LayoutEntry;
  personal: ReturnType<typeof usePersonalData>;
  widgetData: ReturnType<typeof useWidgetData>;
}) {
  const meta = REGISTRY[entry.id];
  const wide = entry.size === "wide";
  const link = HEADER_LINK[entry.id];
  let body: ReactNode;
  let detail: ReactNode;

  if (entry.id === "my-day") {
    body = personal.failed.has("attendances") ? (
      <ErrorState onRetry={personal.refetch} />
    ) : (
      <YourDay
        data={personal.data}
        loading={personal.loading}
        refresh={personal.refetch}
      />
    );
  } else if (entry.id === "approvals") {
    body = <ApprovalsBody />;
  } else if (entry.id === "announcements" || entry.id === "agenda") {
    const field = entry.id === "agenda" ? "events" : "announcements";
    body = personal.loading ? (
      meta.skeleton
    ) : personal.failed.has(field) ? (
      <ErrorState onRetry={personal.refetch} />
    ) : entry.id === "agenda" ? (
      <Agenda data={personal.data} />
    ) : (
      <Announcements items={personal.data.announcements} />
    );
  } else {
    const result = widgetData.results[entry.id];
    const failed = widgetData.failed.has(entry.id);
    if (!result) {
      body = failed ? (
        <ErrorState onRetry={() => widgetData.retry(entry.id)} />
      ) : (
        meta.skeleton
      );
    } else if (!result.ok) {
      body =
        result.error === "forbidden" ? (
          <p className={d.note}>You no longer have access to this.</p>
        ) : (
          <ErrorState onRetry={() => widgetData.retry(entry.id)} />
        );
    } else {
      body = meta.render?.(result.data, { wide });
      if (failed)
        detail = (
          <span className={d.stale}>
            Saved
            {widgetData.staleAt ? ` ${fmtTime(widgetData.staleAt)}` : ""}
          </span>
        );
      else if (widgetData.refreshing.has(entry.id))
        detail = <span className={d.stale}>Updating…</span>;
    }
  }

  return (
    <div className={d.cell} data-size={entry.size}>
      <Section
        id={`w-${entry.id}`}
        title={meta.name}
        detail={detail}
        action={
          link && (
            <TransitionLink to={link.to}>
              <Button size="small" variant="plain">
                {link.label}
              </Button>
            </TransitionLink>
          )
        }
      >
        {body}
      </Section>
    </div>
  );
}

function ApprovalsBody() {
  const { pendingApprovalItems, loadingPendingApprovals } = useContext(
    ApprovalsBadgeContext,
  );
  const decision = useDecision();
  const approvals = pendingApprovalItems.filter(
    (i) => !decision.decided.has(i.instanceId),
  );
  return (
    <>
      {loadingPendingApprovals && approvals.length === 0 ? (
        REGISTRY.approvals.skeleton
      ) : approvals.length === 0 ? (
        <p className={d.note}>Nothing needs your decision.</p>
      ) : (
        <StaggerList>
          {approvals.slice(0, 5).map((item, i) => (
            <ApprovalRow
              key={item.instanceId}
              item={item}
              index={i}
              onApprove={() => decision.approve(item)}
              onReject={() => decision.reject(item)}
            />
          ))}
        </StaggerList>
      )}
      {decision.dialog}
    </>
  );
}
