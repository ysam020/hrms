import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { Swap } from "@next/motion";
import {
  Avatar,
  Button,
  DataTable,
  Field,
  FormGrid,
  Inspector,
  KeyValues,
  Page,
  PrimaryCell,
  SegmentedControl,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  fieldSpan2,
  type Column,
  type Tone,
} from "@next/ui";
import { apiClient, asList, errorMessage, isCanceled } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { fmtDate, personName } from "@next/lib/format";

// Performance reviews. Same sources as Classic: reviews where I'm the subject
// (MY_REVIEWS) or the reviewer (TEAM_REVIEWS), cycle names from REVIEW_CYCLES.
// Self-assessment and manager review submit to Classic's endpoints with the
// same eligibility rules; final approval happens in the Approvals inbox.

const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Self-Assessment Due", tone: "warning" },
  self_assessment_submitted: { label: "Manager Review Due", tone: "warning" },
  manager_review_submitted: { label: "Awaiting Approval", tone: "accent" },
  approved: { label: "Final", tone: "success" },
  rejected: { label: "Returned", tone: "danger" },
};

export default function Performance() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [view, setView] = useState<"mine" | "team">("mine");
  const [reviews, setReviews] = useState<{ mine: any[]; team: any[] }>({
    mine: [],
    team: [],
  });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const cycles = useGet<any>(API_ENDPOINTS.REVIEW_CYCLES(1, 200));
  const people = useGet<any>(API_ENDPOINTS.GET_ALL_USERS());
  const cycleName = useMemo(
    () =>
      Object.fromEntries(
        asList<any>(cycles.data, "cycles").map((c) => [c.id, c]),
      ),
    [cycles.data],
  );
  const nameOf = useMemo(
    () =>
      Object.fromEntries(
        asList<any>(people.data, "users").map((u) => [u.id, personName(u)]),
      ),
    [people.data],
  );

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [mine, team] = await Promise.all([
        apiClient.get(API_ENDPOINTS.MY_REVIEWS(user.id)),
        apiClient.get(API_ENDPOINTS.TEAM_REVIEWS(user.id)),
      ]);
      setReviews({
        mine: asList(mine.data?.data),
        team: asList(team.data?.data),
      });
    } catch (err) {
      if (!isCanceled(err))
        setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, setAlert]);
  useEffect(() => {
    load();
  }, [load]);

  const rows = view === "mine" ? reviews.mine : reviews.team;
  const statusBadge = (s: string) => (
    <StatusBadge tone={STATUS[s]?.tone ?? "neutral"}>
      {STATUS[s]?.label ?? s}
    </StatusBadge>
  );
  const columns: Column<any>[] = [
    {
      key: "who",
      header: view === "mine" ? "Cycle" : "Employee",
      priority: "primary",
      render: (r) =>
        view === "mine" ? (
          <PrimaryCell
            title={cycleName[r.cycleId]?.name ?? "Review"}
            subtitle={`Started ${fmtDate(r.createdAt)}`}
          />
        ) : (
          <PrimaryCell
            leading={<Avatar name={nameOf[r.userId] ?? "?"} size={28} />}
            title={nameOf[r.userId] ?? r.userId}
            subtitle={cycleName[r.cycleId]?.name}
          />
        ),
    },
    {
      key: "self",
      header: "Self",
      align: "right",
      priority: "secondary",
      stackLabel: "Self",
      render: (r) => <span className="px-num">{r.selfRating ?? "—"}</span>,
    },
    {
      key: "mgr",
      header: "Manager",
      align: "right",
      priority: "secondary",
      stackLabel: "Manager",
      render: (r) => <span className="px-num">{r.managerRating ?? "—"}</span>,
    },
    {
      key: "overall",
      header: "Overall",
      align: "right",
      priority: "hidden",
      render: (r) => <b className="px-num">{r.overallRating ?? "—"}</b>,
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => statusBadge(r.status),
    },
  ];

  return (
    <Page
      title="Performance Reviews"
      tabs={
        <SegmentedControl
          label="Reviews"
          value={view}
          onChange={(v) => {
            setView(v);
            setSelected(null);
          }}
          segments={[
            {
              value: "mine",
              label: "My Reviews",
              count: reviews.mine.length || undefined,
            },
            {
              value: "team",
              label: "Reviews I Give",
              count: reviews.team.length || undefined,
            },
          ]}
        />
      }
      inspector={
        <Inspector
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title="Review"
          id={selected?.id}
        >
          {selected && (
            <ReviewDetail
              review={selected}
              scale={cycleName[selected.cycleId]?.ratingScale || 5}
              subject={
                view === "mine" ? personName(user) : nameOf[selected.userId]
              }
              cycle={cycleName[selected.cycleId]?.name}
              onSaved={() => {
                setSelected(null);
                load();
              }}
              badge={statusBadge(selected.status)}
            />
          )}
        </Inspector>
      }
    >
      <Swap id={view}>
        <DataTable
          label={view === "mine" ? "My reviews" : "Reviews I give"}
          columns={columns}
          rows={rows}
          rowId={(r) => String(r.id)}
          loading={loading}
          onRowClick={setSelected}
          selectedId={selected?.id ?? null}
          stickyOffset={52}
          empty={{
            icon: "star",
            title:
              view === "mine"
                ? "No reviews yet"
                : "No one is waiting on your review",
            body:
              view === "mine"
                ? "When a review cycle includes you, it appears here."
                : undefined,
          }}
        />
      </Swap>
    </Page>
  );
}

function ReviewDetail({
  review,
  scale,
  subject,
  cycle,
  onSaved,
  badge,
}: {
  review: any;
  scale: number;
  subject?: string;
  cycle?: string;
  onSaved: () => void;
  badge: React.ReactNode;
}) {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const canSelf = review.userId === user?.id && review.status === "draft";
  const canManager =
    review.reviewerId === user?.id &&
    review.status === "self_assessment_submitted";
  const [v, setV] = useState({
    selfRating: "",
    selfComments: "",
    managerRating: "",
    managerComments: "",
    overallRating: "",
    recommendedIncrementPct: "",
  });
  const [saving, setSaving] = useState(false);
  // Final sign-off runs through the approval chain (as in Classic's Reviews):
  // find this review's pending approval instance for the signed-in approver.
  const pending = useGet<any>(
    review.status === "manager_review_submitted"
      ? API_ENDPOINTS.GET_PENDING_APPROVALS
      : null,
  );
  const instanceId: string | undefined = asList<any>(pending.data).find(
    (p) => p.module === "performance_review" && p.entityId === review.id,
  )?.instanceId;
  const decide = async (decision: "approved" | "rejected") => {
    if (!instanceId) return;
    setSaving(true);
    try {
      await apiClient.put(API_ENDPOINTS.ACT_ON_APPROVAL(instanceId), {
        decision,
      });
      setAlert({
        open: true,
        message:
          decision === "approved" ? "Review approved." : "Review returned.",
        severity: "success",
      });
      onSaved();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  const [error, setError] = useState<string | null>(null);
  const ratings = Array.from({ length: scale }, (_, i) => String(i + 1));
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (canSelf && (!v.selfRating || !v.selfComments.trim()))
      return setError("Add a rating and a few words about your period.");
    if (
      canManager &&
      (!v.managerRating || !v.overallRating || !v.managerComments.trim())
    )
      return setError("Add both ratings and your comments.");
    setError(null);
    setSaving(true);
    try {
      if (canSelf)
        await apiClient.post(API_ENDPOINTS.SUBMIT_SELF_ASSESSMENT(review.id), {
          selfComments: v.selfComments.trim(),
          selfRating: Number(v.selfRating),
        });
      else
        await apiClient.post(API_ENDPOINTS.SUBMIT_MANAGER_REVIEW(review.id), {
          managerComments: v.managerComments.trim(),
          managerRating: Number(v.managerRating),
          overallRating: Number(v.overallRating),
          ...(v.recommendedIncrementPct
            ? { recommendedIncrementPct: Number(v.recommendedIncrementPct) }
            : {}),
        });
      setAlert({
        open: true,
        message: canSelf
          ? "Self-assessment submitted."
          : "Manager review submitted.",
        severity: "success",
      });
      onSaved();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <p className="px-section">{subject}</p>
        <p className="px-meta">{cycle}</p>
        <span>{badge}</span>
      </div>
      <KeyValues
        items={[
          [
            "Self Rating",
            review.selfRating ? `${review.selfRating} / ${scale}` : null,
          ],
          ["Self Comments", review.selfComments],
          [
            "Manager Rating",
            review.managerRating ? `${review.managerRating} / ${scale}` : null,
          ],
          ["Manager Comments", review.managerComments],
          [
            "Overall",
            review.overallRating ? `${review.overallRating} / ${scale}` : null,
          ],
          [
            "Recommended Increment",
            review.recommendedIncrementPct != null
              ? `${review.recommendedIncrementPct}%`
              : null,
          ],
        ]}
      />
      {instanceId && (
        <div className="px-row" style={{ justifyContent: "flex-end" }}>
          <Button
            variant="tintedDanger"
            busy={saving}
            onClick={() => decide("rejected")}
          >
            Return
          </Button>
          <Button
            variant="primary"
            busy={saving}
            onClick={() => decide("approved")}
          >
            Approve Review
          </Button>
        </div>
      )}
      {(canSelf || canManager) && (
        <form onSubmit={submit} noValidate style={{ display: "grid", gap: 14 }}>
          <h3 className="px-headline">
            {canSelf ? "Your Self-Assessment" : "Your Review"}
          </h3>
          <FormGrid columns={2}>
            {canSelf ? (
              <>
                <Field label="Rating" className={fieldSpan2}>
                  <SegmentedControl
                    role="radiogroup"
                    label="Rating"
                    value={v.selfRating}
                    onChange={(r) => setV((x) => ({ ...x, selfRating: r }))}
                    segments={ratings.map((r) => ({ value: r, label: r }))}
                  />
                </Field>
                <Field label="Comments" className={fieldSpan2}>
                  <TextArea
                    rows={5}
                    value={v.selfComments}
                    onChange={set("selfComments")}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Manager Rating">
                  <Select
                    value={v.managerRating}
                    onChange={set("managerRating")}
                  >
                    <option value="">Choose…</option>
                    {ratings.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Overall Rating">
                  <Select
                    value={v.overallRating}
                    onChange={set("overallRating")}
                  >
                    <option value="">Choose…</option>
                    {ratings.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Comments" className={fieldSpan2}>
                  <TextArea
                    rows={5}
                    value={v.managerComments}
                    onChange={set("managerComments")}
                  />
                </Field>
                <Field
                  label="Recommended Increment (%)"
                  optional
                  className={fieldSpan2}
                >
                  <TextInput
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    inputMode="decimal"
                    value={v.recommendedIncrementPct}
                    onChange={set("recommendedIncrementPct")}
                  />
                </Field>
              </>
            )}
          </FormGrid>
          {error && (
            <p
              role="alert"
              className="px-meta"
              style={{ color: "var(--px-danger)" }}
            >
              {error}
            </p>
          )}
          <div>
            <Button type="submit" variant="primary" busy={saving}>
              Submit
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
