import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import GavelIcon from "@mui/icons-material/Gavel";
import ChecklistIcon from "@mui/icons-material/Checklist";
import QuizIcon from "@mui/icons-material/Quiz";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import { API_ENDPOINTS } from "@web/shared/constants";
import { NoticePeriodTab } from "./NoticePeriodTab";
import { ChecklistTab } from "./ChecklistTab";
import { ExitInterviewQuestionsTab } from "./ExitInterviewQuestionsTab";
import type {
  ExitChecklistItemDef,
  ExitQuestion,
  NoticePeriodPolicy,
} from "./types";

export default function ExitPolicySettings() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const canEdit =
    isHrOrAbove(user) ||
    user?.permissions?.includes("Organisation:edit_organisation_settings");

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);

  const [policies, setPolicies] = useState<NoticePeriodPolicy[]>([]);
  const [checklistDefs, setChecklistDefs] = useState<ExitChecklistItemDef[]>(
    [],
  );
  const [questions, setQuestions] = useState<ExitQuestion[]>([]);

  async function fetchPolicies() {
    const res = await apiClient.get(API_ENDPOINTS.LIST_NOTICE_PERIOD_POLICIES);
    setPolicies(res.data?.data ?? []);
  }
  async function fetchChecklist() {
    const res = await apiClient.get(API_ENDPOINTS.LIST_EXIT_CHECKLIST_DEFS);
    setChecklistDefs(res.data?.data ?? []);
  }
  async function fetchTemplate() {
    const res = await apiClient.get(API_ENDPOINTS.GET_EXIT_INTERVIEW_TEMPLATE);
    setQuestions(res.data?.data?.questions ?? []);
  }

  // Only used for the initial load — individual save/delete handlers below
  // refetch just their own tab's slice, so editing questions on one tab
  // doesn't get silently discarded by a save on another tab overwriting
  // `questions` with whatever's still in the DB.
  async function fetchAll() {
    setLoading(true);
    try {
      await Promise.all([fetchPolicies(), fetchChecklist(), fetchTemplate()]);
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ??
          "Failed to load exit policy settings.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Notice period bands by tenure, the offboarding clearance checklist,
          and the exit interview questions employees see when they leave.
          Nothing configured here yet? Every resignation defaults to 30 days'
          notice and a standard exit survey.
        </Typography>
      </Box>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have read-only access. Contact an owner, admin, or HR to make
          changes.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: "divider", px: 1 }}
        >
          <Tab
            icon={<GavelIcon fontSize="small" />}
            iconPosition="start"
            label={`Notice Period (${policies.length})`}
          />
          <Tab
            icon={<ChecklistIcon fontSize="small" />}
            iconPosition="start"
            label={`Checklist (${checklistDefs.length})`}
          />
          <Tab
            icon={<QuizIcon fontSize="small" />}
            iconPosition="start"
            label={`Exit Interview (${questions.length})`}
          />
        </Tabs>

        {tab === 0 && (
          <NoticePeriodTab
            policies={policies}
            canEdit={!!canEdit}
            onRefetch={fetchPolicies}
            setAlert={setAlert}
          />
        )}
        {tab === 1 && (
          <ChecklistTab
            checklistDefs={checklistDefs}
            canEdit={!!canEdit}
            onRefetch={fetchChecklist}
            setAlert={setAlert}
          />
        )}
        {tab === 2 && (
          <ExitInterviewQuestionsTab
            questions={questions}
            setQuestions={setQuestions}
            canEdit={!!canEdit}
            setAlert={setAlert}
          />
        )}
      </Paper>
    </Box>
  );
}
