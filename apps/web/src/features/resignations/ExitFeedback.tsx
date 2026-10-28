import { useContext, useEffect, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Banner,
  Button,
  EmptyState,
  Field,
  Page,
  SegmentedControl,
  Skeleton,
  TextArea,
  FormSkeleton,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";

// Exit feedback (Classic's ExitFeedbackForm): the tenant's exit-interview
// template, available once the signed-in person's resignation is approved.

type Q = {
  id: string;
  label: string;
  type: "rating" | "boolean" | "text";
  required?: boolean;
};

export default function ExitFeedback() {
  const { setAlert } = useContext(AlertContext);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [resignationId, setResignationId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<
    Record<string, string | number | boolean>
  >({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get(API_ENDPOINTS.GET_EXIT_INTERVIEW_TEMPLATE),
      apiClient.get(API_ENDPOINTS.GET_MY_RESIGNATION),
    ])
      .then(([t, r]) => {
        setQuestions(t.data?.data?.questions ?? []);
        const res = r.data?.data;
        if (!res?.id)
          setBlocked(
            "You don’t have a resignation on record, so there’s no exit interview to fill in.",
          );
        else if (res.status !== "Approved")
          setBlocked("Exit feedback opens once your resignation is approved.");
        else setResignationId(res.id);
      })
      .catch(() =>
        setBlocked("The exit interview couldn’t be loaded. Try again later."),
      )
      .finally(() => setLoading(false));
  }, []);

  const missing = questions.filter(
    (q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""),
  );
  const submit = async () => {
    if (!resignationId) return;
    setSaving(true);
    try {
      const res = await apiClient.post(
        API_ENDPOINTS.SUBMIT_EXIT_INTERVIEW_RESPONSE(resignationId),
        {
          answers: questions
            .filter((q) => answers[q.id] !== undefined)
            .map((q) => ({ questionId: q.id, value: answers[q.id] })),
        },
      );
      setAlert({
        open: true,
        message: res.data?.message ?? "Thanks — your feedback was submitted.",
        severity: "success",
      });
      setDone(true);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Exit Feedback" width="reading">
      {loading ? (
        <FormSkeleton fields={5} columns={1} />
      ) : blocked ? (
        <EmptyState icon="door" title="Nothing to fill in yet">
          {blocked}
        </EmptyState>
      ) : done ? (
        <EmptyState icon="checkCircle" title="Thank you">
          Your answers help make this a better place to work.
        </EmptyState>
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          <Banner tone="accent">
            Your answers go to HR. They’re used to improve how the company
            works, not to evaluate you.
          </Banner>
          {questions.map((q) => (
            <Field key={q.id} label={q.label} optional={!q.required}>
              {q.type === "rating" ? (
                <SegmentedControl
                  role="radiogroup"
                  label={q.label}
                  value={String(answers[q.id] ?? "")}
                  onChange={(v) =>
                    setAnswers((a) => ({ ...a, [q.id]: Number(v) }))
                  }
                  segments={["1", "2", "3", "4", "5"].map((n) => ({
                    value: n,
                    label: n,
                  }))}
                />
              ) : q.type === "boolean" ? (
                <SegmentedControl
                  role="radiogroup"
                  label={q.label}
                  value={
                    answers[q.id] === undefined ? "" : String(answers[q.id])
                  }
                  onChange={(v) =>
                    setAnswers((a) => ({ ...a, [q.id]: v === "true" }))
                  }
                  segments={[
                    { value: "true", label: "Yes" },
                    { value: "false", label: "No" },
                  ]}
                />
              ) : (
                <TextArea
                  rows={3}
                  value={String(answers[q.id] ?? "")}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                  }
                />
              )}
            </Field>
          ))}
          <div className="px-row" style={{ justifyContent: "flex-end" }}>
            {missing.length > 0 && (
              <span className="px-meta">
                {missing.length} required question(s) left
              </span>
            )}
            <Button
              variant="primary"
              busy={saving}
              disabled={missing.length > 0}
              onClick={submit}
            >
              Submit Feedback
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}
