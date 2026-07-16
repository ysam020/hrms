import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
import Grid from "@mui/material/Grid2";
import TextField from "@mui/material/TextField";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import {
  newQuestionId,
  type ExitQuestion,
  type TabSectionProps,
} from "./types";

export function ExitInterviewQuestionsTab({
  questions,
  setQuestions,
  canEdit,
  setAlert,
}: TabSectionProps & {
  questions: ExitQuestion[];
  setQuestions: (
    update: ExitQuestion[] | ((qs: ExitQuestion[]) => ExitQuestion[]),
  ) => void;
}) {
  const [savingQuestions, setSavingQuestions] = useState(false);

  function addQuestion() {
    setQuestions((qs) => [
      ...qs,
      { id: newQuestionId(), label: "", type: "text", required: false },
    ]);
  }
  function updateQuestion(id: string, patch: Partial<ExitQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }
  function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }
  async function saveQuestions() {
    setSavingQuestions(true);
    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_EXIT_INTERVIEW_TEMPLATE, {
        questions,
      });
      setAlert({
        open: true,
        message: "Exit interview questions saved.",
        severity: "success",
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save questions.",
        severity: "error",
      });
    } finally {
      setSavingQuestions(false);
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Shown to employees after an approved resignation. Leave this empty to
        use the standard 4-question survey.
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {questions.map((q, i) => (
          <Paper key={q.id} variant="outlined" sx={{ p: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label={`Question ${i + 1}`}
                  size="small"
                  fullWidth
                  disabled={!canEdit}
                  value={q.label}
                  onChange={(e) =>
                    updateQuestion(q.id, { label: e.target.value })
                  }
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <FormControl fullWidth size="small" disabled={!canEdit}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    label="Type"
                    value={q.type}
                    onChange={(e) =>
                      updateQuestion(q.id, {
                        type: e.target.value as ExitQuestion["type"],
                      })
                    }
                  >
                    <MenuItem value="rating">Rating</MenuItem>
                    <MenuItem value="text">Text</MenuItem>
                    <MenuItem value="boolean">Yes/No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 4, sm: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      disabled={!canEdit}
                      checked={q.required}
                      onChange={(e) =>
                        updateQuestion(q.id, { required: e.target.checked })
                      }
                    />
                  }
                  label={<Typography variant="caption">Required</Typography>}
                />
              </Grid>
              {canEdit && (
                <Grid size={{ xs: 2, sm: 1 }}>
                  <IconButton size="small" onClick={() => removeQuestion(q.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Grid>
              )}
            </Grid>
          </Paper>
        ))}
      </Box>

      {canEdit && (
        <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
          <Button
            variant="outline"
            size="small"
            icon={<AddCircleOutlineIcon />}
            onClick={addQuestion}
          >
            Add question
          </Button>
          <Button
            variant="primary"
            size="small"
            icon={<SaveIcon />}
            loading={savingQuestions}
            onClick={saveQuestions}
            disabled={savingQuestions}
          >
            Save questions
          </Button>
        </Box>
      )}
    </Box>
  );
}
