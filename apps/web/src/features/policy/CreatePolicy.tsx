import React, { useContext, useState } from "react";
import DOMPurify from "dompurify";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid2";
import Paper from "@mui/material/Paper";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Add from "@mui/icons-material/Add";
import Description from "@mui/icons-material/Description";
import { Editor } from "primereact/editor";
import Button from "@web/shared/components/Button";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

const POLICY_TYPES = [
  "POSH Policy",
  "Advance Salary Policy",
  "Code of Conduct",
  "Leave Policy",
  "Other",
];

function CreatePolicy({ onSaved }) {
  const { setAlert } = useContext(AlertContext);
  const [policyType, setPolicyType] = useState("");
  const [policyName, setPolicyName] = useState("");
  const [content, setContent] = useState<string | null>("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    policyType?: string;
    policyName?: string;
    content?: string;
  }>({});

  const validate = () => {
    const newErrors: {
      policyType?: string;
      policyName?: string;
      content?: string;
    } = {};
    if (!policyType) newErrors.policyType = "Policy type is required";
    if (policyType === "Other" && !policyName.trim())
      newErrors.policyName = "Policy name is required";
    if (!content || DOMPurify.sanitize(content, { ALLOWED_TAGS: [] }).trim().length < 10)
      newErrors.content = "Content must be at least 10 characters";
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload: {
        policyType: string;
        content: string;
        policyName?: string;
      } = { policyType, content: content ?? "" };
      if (policyType === "Other") payload.policyName = policyName.trim();
      const res = await apiClient.post(API_ENDPOINTS.CREATE_POLICY, payload);
      const upserted = res.data.data?._upserted;
      setAlert({
        open: true,
        message: upserted ? "Policy updated successfully" : res.data.message,
        severity: "success",
      });
      // Reset only on success
      setPolicyType("");
      setPolicyName("");
      setContent(null); // null forces PrimeReact Editor to re-render empty
      onSaved?.();
    } catch (err) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to create policy",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 860, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Add color="primary" />
          <Typography variant="h6" fontWeight="600">
            Create Policy
          </Typography>
        </Box>

        <form onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            {/* Policy Type */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Description sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Policy Details
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={policyType === "Other" ? 6 : 12}>
                    <TextField
                      fullWidth
                      select
                      size="small"
                      label="Policy Type"
                      value={policyType}
                      onChange={(e) => {
                        setPolicyType(e.target.value);
                        setPolicyName("");
                        setErrors((prev) => ({
                          ...prev,
                          policyType: undefined,
                          policyName: undefined,
                        }));
                      }}
                      error={!!errors.policyType}
                      helperText={errors.policyType}
                    >
                      {POLICY_TYPES.map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {policyType === "Other" && (
                    <Grid size={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Policy Name"
                        placeholder="e.g. Work From Home Policy"
                        value={policyName}
                        onChange={(e) => setPolicyName(e.target.value)}
                        error={!!errors.policyName}
                        helperText={errors.policyName}
                      />
                    </Grid>
                  )}
                </Grid>
              </Paper>
            </Grid>

            {/* Rich Text Editor */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Typography variant="subtitle2" fontWeight="500" mb={1}>
                  Policy Content
                </Typography>
                <Box
                  sx={{
                    "& .p-editor-container": { borderRadius: 1 },
                    "& .p-editor-content": { minHeight: 320 },
                  }}
                >
                  <Editor
                    value={content ?? ""}
                    onTextChange={(e) => setContent(e.htmlValue || "")}
                    style={{ height: "220px" }}
                  />
                </Box>
                {errors.content && (
                  <Typography
                    variant="caption"
                    color="error"
                    mt={0.5}
                    display="block"
                  >
                    {errors.content}
                  </Typography>
                )}
              </Paper>
            </Grid>

            <Grid size={12}>
              <Box display="flex" justifyContent="center">
                <Button
                  type="submit"
                  disabled={submitting}
                  sx={{
                    minWidth: 160,
                    textTransform: "none",
                    fontWeight: "500",
                  }}
                >
                  {submitting ? "Saving…" : "Save Policy"}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default React.memo(CreatePolicy);
