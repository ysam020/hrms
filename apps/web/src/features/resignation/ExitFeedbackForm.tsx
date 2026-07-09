import { memo, useContext, useEffect, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Rating from "@mui/material/Rating";
import TextField from "@mui/material/TextField";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid2";
import Feedback from "@mui/icons-material/Feedback";
import ExitToApp from "@mui/icons-material/ExitToApp";
import Button from "@web/shared/components/Button";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

interface ExitQuestion {
  id: string;
  label: string;
  type: "rating" | "text" | "boolean";
  required: boolean;
}

/**
 * Renders whatever exit-interview question set the organisation has
 * configured (Settings → Exit Policy → Exit Interview). No questions
 * configured yet? A standard 4-question survey is used automatically.
 */
function ExitFeedbackForm() {
  const { setAlert } = useContext(AlertContext);

  const [loading, setLoading] = useState(true);
  const [resignationId, setResignationId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExitQuestion[]>([]);
  const [answers, setAnswers] = useState<
    Record<string, string | number | boolean>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [templateRes, resignationRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.GET_EXIT_INTERVIEW_TEMPLATE),
          apiClient.get(API_ENDPOINTS.GET_MY_RESIGNATION),
        ]);
        setQuestions(templateRes.data?.data?.questions ?? []);

        const resignation = resignationRes.data?.data;
        if (!resignation?.id) {
          setLoadError(
            "You don't have a resignation on record — exit feedback isn't applicable.",
          );
        } else if (resignation.status !== "Approved") {
          setLoadError(
            "Exit feedback is available once your resignation is approved.",
          );
        } else {
          setResignationId(resignation.id);
        }
      } catch {
        setLoadError(
          "Couldn't load the exit interview. Please try again later.",
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function setAnswer(questionId: string, value: string | number | boolean) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  const missingRequired = questions.filter(
    (q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""),
  );

  async function handleSubmit() {
    if (!resignationId) return;
    setSubmitting(true);
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
        message: res.data?.message ?? "Feedback submitted.",
        severity: "success",
      });
      setSubmitted(true);
    } catch (error: any) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : (error.response?.data?.message ?? "Something went wrong."),
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Card sx={{ maxWidth: 800, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <ExitToApp color="primary" />
          <Typography variant="h6" fontWeight="600">
            Exit Feedback
          </Typography>
        </Box>

        {loadError ? (
          <Alert severity="info">{loadError}</Alert>
        ) : submitted ? (
          <Alert severity="success">
            Thanks — your feedback has been recorded.
          </Alert>
        ) : (
          <>
            <Paper sx={{ p: 1.5, bgcolor: "background.default", mb: 1.5 }}>
              <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                <Feedback sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="subtitle2" fontWeight="500">
                  A few questions before you go
                </Typography>
              </Box>
              <Grid container spacing={2}>
                {questions.map((q) => (
                  <Grid
                    size={q.type === "rating" ? { xs: 12, sm: 6 } : 12}
                    key={q.id}
                  >
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      {q.label}
                      {q.required && (
                        <Typography component="span" color="error">
                          {" "}
                          *
                        </Typography>
                      )}
                    </Typography>
                    {q.type === "rating" && (
                      <Rating
                        value={Number(answers[q.id]) || 0}
                        onChange={(_, value) => setAnswer(q.id, value ?? 0)}
                        size="large"
                      />
                    )}
                    {q.type === "boolean" && (
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={answers[q.id] ?? null}
                        onChange={(_, value) =>
                          value !== null && setAnswer(q.id, value)
                        }
                      >
                        <ToggleButton value={true}>Yes</ToggleButton>
                        <ToggleButton value={false}>No</ToggleButton>
                      </ToggleButtonGroup>
                    )}
                    {q.type === "text" && (
                      <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        size="small"
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      />
                    )}
                  </Grid>
                ))}
              </Grid>
            </Paper>

            <Box display="flex" justifyContent="center" mt={2}>
              <Button
                onClick={handleSubmit}
                disabled={submitting || missingRequired.length > 0}
                loading={submitting}
                loadingText="Submitting..."
                sx={{ minWidth: 160, textTransform: "none", fontWeight: "500" }}
              >
                Submit Feedback
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(ExitFeedbackForm);
