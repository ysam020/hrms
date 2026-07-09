import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Divider from "@mui/material/Divider";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import DownloadIcon from "@mui/icons-material/Download";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { API_ENDPOINTS } from "@web/shared/constants";

const ENTITIES = [
  "employee",
  "attendance",
  "leave",
  "salary",
  "recruitment",
  "payroll",
];
const OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains"];

interface Filter {
  field: string;
  operator: string;
  value: string;
}

function ReportBuilder() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const [entity, setEntity] = useState("employee");
  const [schema, setSchema] = useState<{
    selectableFields: string[];
    filterableFields: string[];
  } | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sort, setSort] = useState({
    field: "",
    direction: "desc" as "asc" | "desc",
  });
  const [limit, setLimit] = useState(100);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [openSave, setOpenSave] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  // Load schema when entity changes
  useEffect(() => {
    setLoadingSchema(true);
    setSchema(null);
    setSelectedColumns([]);
    setFilters([]);
    setRows(null);
    apiClient(API_ENDPOINTS.ENTITY_SCHEMA(entity))
      .then((res) => {
        const s = res.data.data;
        setSchema(s);
        // Pre-select first 5 fields
        setSelectedColumns(s.selectableFields.slice(0, 5));
      })
      .catch(() =>
        setAlert({
          open: true,
          message: "Failed to load entity schema",
          severity: "error",
        }),
      )
      .finally(() => setLoadingSchema(false));
  }, [entity, setAlert]);

  const toggleColumn = useCallback((col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  }, []);

  const addFilter = useCallback(() => {
    if (!schema?.filterableFields[0]) return;
    setFilters((f) => [
      ...f,
      { field: schema.filterableFields[0], operator: "eq", value: "" },
    ]);
  }, [schema]);

  const removeFilter = useCallback((idx: number) => {
    setFilters((f) => f.filter((_, i) => i !== idx));
  }, []);

  const updateFilter = useCallback(
    (idx: number, key: keyof Filter, val: string) => {
      setFilters((prev) =>
        prev.map((f, i) => (i === idx ? { ...f, [key]: val } : f)),
      );
    },
    [],
  );

  const buildConfig = () => ({
    entity,
    columns: selectedColumns,
    filters: filters.filter((f) => f.value.trim()),
    sort: sort.field ? sort : undefined,
    limit,
  });

  const handleRun = useCallback(async () => {
    if (selectedColumns.length === 0) {
      setAlert({
        open: true,
        message: "Select at least one column",
        severity: "warning",
      });
      return;
    }
    setRunning(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.RUN_REPORT, buildConfig());
      setRows(res.data.data?.rows ?? []);
      setAlert({
        open: true,
        message: `${res.data.data?.rowCount ?? 0} row(s) returned`,
        severity: "success",
      });
    } catch (err) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Report run failed",
        severity: "error",
      });
    } finally {
      setRunning(false);
    }
  }, [entity, selectedColumns, filters, sort, limit, setAlert]);

  const handleDownloadCSV = useCallback(async () => {
    if (selectedColumns.length === 0) return;
    try {
      const res = await apiClient.post(
        API_ENDPOINTS.RUN_REPORT,
        { ...buildConfig(), format: "csv" },
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entity}_report_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setAlert({
        open: true,
        message: "CSV download failed",
        severity: "error",
      });
    }
  }, [entity, selectedColumns, filters, sort, limit, setAlert]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.SAVE_REPORT, {
        ...saveForm,
        entity,
        config: buildConfig(),
      });
      setOpenSave(false);
      setSaveForm({ name: "", description: "" });
      setAlert({ open: true, message: "Report saved", severity: "success" });
    } catch (err) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Save failed",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [saveForm, entity, selectedColumns, filters, sort, limit, setAlert]);

  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const tableHeaders = useMemo(
    () => (rows && rows.length > 0 ? Object.keys(rows[0]) : []),
    [rows],
  );

  return (
    <Box>
      <Grid container spacing={2}>
        {/* Left: Configuration panel */}
        <Grid item xs={12} md={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: "12px",
              border: `1px solid ${borderColor}`,
              height: "100%",
            }}
          >
            {/* Entity selector */}
            <Typography variant="body2" fontWeight={700} gutterBottom>
              1. Select Entity
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              sx={{ mb: 2 }}
            >
              {ENTITIES.map((e) => (
                <MenuItem key={e} value={e}>
                  {e.charAt(0).toUpperCase() + e.slice(1)}
                </MenuItem>
              ))}
            </TextField>

            {loadingSchema ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              schema && (
                <>
                  {/* Column selection */}
                  <Typography variant="body2" fontWeight={700} gutterBottom>
                    2. Select Columns
                  </Typography>
                  <FormGroup sx={{ mb: 2, maxHeight: 200, overflowY: "auto" }}>
                    {schema.selectableFields.map((col) => (
                      <FormControlLabel
                        key={col}
                        control={
                          <Checkbox
                            size="small"
                            checked={selectedColumns.includes(col)}
                            onChange={() => toggleColumn(col)}
                          />
                        }
                        label={<Typography variant="caption">{col}</Typography>}
                      />
                    ))}
                  </FormGroup>

                  <Divider sx={{ my: 1.5 }} />

                  {/* Filters */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Typography variant="body2" fontWeight={700}>
                      3. Filters
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={addFilter}
                      disabled={schema.filterableFields.length === 0}
                    >
                      <AddIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Box>

                  {filters.map((f, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: "flex",
                        gap: 0.5,
                        mb: 1,
                        alignItems: "center",
                      }}
                    >
                      <TextField
                        select
                        size="small"
                        value={f.field}
                        onChange={(e) =>
                          updateFilter(idx, "field", e.target.value)
                        }
                        sx={{ flex: 1.2 }}
                      >
                        {schema.filterableFields.map((fld) => (
                          <MenuItem key={fld} value={fld}>
                            {fld}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        size="small"
                        value={f.operator}
                        onChange={(e) =>
                          updateFilter(idx, "operator", e.target.value)
                        }
                        sx={{ flex: 1 }}
                      >
                        {OPERATORS.map((op) => (
                          <MenuItem key={op} value={op}>
                            {op}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        size="small"
                        value={f.value}
                        onChange={(e) =>
                          updateFilter(idx, "value", e.target.value)
                        }
                        sx={{ flex: 1.3 }}
                        placeholder="value"
                      />
                      <IconButton
                        size="small"
                        onClick={() => removeFilter(idx)}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  ))}

                  <Divider sx={{ my: 1.5 }} />

                  {/* Sort */}
                  <Typography variant="body2" fontWeight={700} gutterBottom>
                    4. Sort
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
                    <TextField
                      select
                      size="small"
                      label="Field"
                      value={sort.field}
                      onChange={(e) =>
                        setSort((s) => ({ ...s, field: e.target.value }))
                      }
                      sx={{ flex: 2 }}
                    >
                      <MenuItem value="">None</MenuItem>
                      {schema.filterableFields.map((fld) => (
                        <MenuItem key={fld} value={fld}>
                          {fld}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      size="small"
                      label="Dir"
                      value={sort.direction}
                      onChange={(e) =>
                        setSort((s) => ({
                          ...s,
                          direction: e.target.value as "asc" | "desc",
                        }))
                      }
                      sx={{ flex: 1 }}
                    >
                      <MenuItem value="asc">Asc</MenuItem>
                      <MenuItem value="desc">Desc</MenuItem>
                    </TextField>
                  </Box>

                  {/* Limit */}
                  <Typography variant="body2" fontWeight={700} gutterBottom>
                    5. Row Limit
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    fullWidth
                    value={limit}
                    onChange={(e) =>
                      setLimit(
                        Math.min(10000, Math.max(1, Number(e.target.value))),
                      )
                    }
                    inputProps={{ min: 1, max: 10000 }}
                  />
                </>
              )
            )}
          </Paper>
        </Grid>

        {/* Right: Results panel */}
        <Grid item xs={12} md={8}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: "12px",
              border: `1px solid ${borderColor}`,
            }}
          >
            <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
              <Button
                size="small"
                variant="contained"
                startIcon={
                  running ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <PlayArrowIcon />
                  )
                }
                onClick={handleRun}
                disabled={
                  running || loadingSchema || selectedColumns.length === 0
                }
                sx={{ borderRadius: "8px", textTransform: "none" }}
              >
                {running ? "Running…" : "Run Report"}
              </Button>
              {rows && (
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={handleDownloadCSV}
                    sx={{ borderRadius: "8px", textTransform: "none" }}
                  >
                    Download CSV
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<SaveIcon />}
                    onClick={() => setOpenSave(true)}
                    sx={{ borderRadius: "8px", textTransform: "none" }}
                  >
                    Save Report
                  </Button>
                </>
              )}
              {rows && (
                <Chip
                  label={`${rows.length} rows`}
                  size="small"
                  sx={{
                    alignSelf: "center",
                    backgroundColor: "rgba(99,102,241,0.15)",
                    color: "#6366f1",
                  }}
                />
              )}
            </Box>

            {rows === null ? (
              <Box sx={{ p: 6, textAlign: "center" }}>
                <PlayArrowIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
                <Typography color="text.secondary">
                  Configure your report and click Run to see results.
                </Typography>
              </Box>
            ) : rows.length === 0 ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography color="text.secondary">
                  No data matching the current filters.
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.8rem",
                  }}
                >
                  <thead>
                    <tr>
                      {tableHeaders.map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            position: "sticky",
                            top: 0,
                            zIndex: 1,
                            backgroundColor: isDark ? "#1e2a31" : "#f3f4f6",
                            borderBottom: `1px solid ${borderColor}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        style={{
                          backgroundColor:
                            rowIdx % 2 === 0
                              ? "transparent"
                              : isDark
                                ? "rgba(255,255,255,0.02)"
                                : "rgba(0,0,0,0.015)",
                        }}
                      >
                        {tableHeaders.map((h) => (
                          <td
                            key={h}
                            style={{
                              padding: "7px 12px",
                              borderBottom: `1px solid ${borderColor}`,
                              whiteSpace: "nowrap",
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {row[h] == null
                              ? "—"
                              : typeof row[h] === "boolean"
                                ? row[h]
                                  ? "Yes"
                                  : "No"
                                : String(row[h])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Save Dialog */}
      <Dialog
        open={openSave}
        onClose={() => setOpenSave(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Save Report</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          <TextField
            label="Report Name"
            size="small"
            fullWidth
            value={saveForm.name}
            onChange={(e) =>
              setSaveForm((f) => ({ ...f, name: e.target.value }))
            }
          />
          <TextField
            label="Description (optional)"
            size="small"
            multiline
            rows={2}
            fullWidth
            value={saveForm.description}
            onChange={(e) =>
              setSaveForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSave(false)} size="small">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            size="small"
            disabled={saving || !saveForm.name}
            sx={{ borderRadius: "8px", textTransform: "none" }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default memo(ReportBuilder);
