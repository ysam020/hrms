import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import Tooltip from "@mui/material/Tooltip";
import Paper from "@mui/material/Paper";
import TablePagination from "@mui/material/TablePagination";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import CircularProgress from "@mui/material/CircularProgress";
import RadioGroup from "@mui/material/RadioGroup";
import Radio from "@mui/material/Radio";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";

import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import TestIcon from "@mui/icons-material/PlayArrow";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import ExportIcon from "@mui/icons-material/GetApp";
import ActiveIcon from "@mui/icons-material/CheckCircle";
import InactiveIcon from "@mui/icons-material/Cancel";
import DraftIcon from "@mui/icons-material/Schedule";
import FilterIcon from "@mui/icons-material/FilterList";
import apiClient from "@web/core/http/axiosConfig";
import { useApiClient } from "@web/shared/hooks/useApiClient";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

type SnackbarState = {
  open: boolean;
  message: string;
  severity: "error" | "warning" | "info" | "success";
};

const RuleList = ({ onEditRule, onCreateRule }) => {
  const api = useApiClient();
  // State management
  const [rules, setRules] = useState<any[]>([]);
  const [filteredRules, setFilteredRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testRule, setTestRule] = useState<any>(null);
  const [testData, setTestData] = useState("{}");
  const [testResult, setTestResult] = useState<any>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<any>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [selectedCategoryForCreation, setSelectedCategoryForCreation] =
    useState("attendance");

  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: "",
    severity: "success",
  });

  // Categories configuration
  const categories = [
    { value: "attendance", label: "Attendance", icon: "📅" },
    { value: "leave", label: "Leave Management", icon: "🏖️" },
  ];

  useEffect(() => {
    loadRules();
  }, []); // Load all rules once on mount

  useEffect(() => {
    filterRules();
  }, [rules, searchQuery, statusFilter, categoryFilter]);

  const loadRules = async () => {
    try {
      setLoading(true);
      const response = await api.get(API_ENDPOINTS.GET_RULES);
      setRules(response.data.data || []);
    } catch (error) {
      console.error("Error loading rules:", error);
      showSnackbar("Failed to load rules", "error");
    } finally {
      setLoading(false);
    }
  };

  const filterRules = () => {
    let filtered = [...rules];

    // Filter by category
    if (categoryFilter !== "all") {
      filtered = filtered.filter((rule) => rule.category === categoryFilter);
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        (rule) =>
          rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          rule.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          rule.tags?.some((tag) =>
            tag.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
      );
    }

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter((rule) => rule.status === statusFilter);
    }

    setFilteredRules(filtered);
    setPage(0);
  };

  const showSnackbar = (
    message: string,
    severity: "success" | "error" | "info" | "warning" = "success",
  ) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleCreateVisualRule = () => {
    setShowCategoryDialog(true);
  };

  const handleConfirmCategorySelection = () => {
    setShowCategoryDialog(false);
    if (onCreateRule) {
      onCreateRule(selectedCategoryForCreation, null);
    }
  };

  const handleEditRule = (rule) => {
    if (onEditRule) {
      onEditRule(rule);
    }
  };

  const handleDeleteClick = (rule) => {
    setRuleToDelete(rule);
    setShowDeleteDialog(true);
  };

  const confirmDeleteRule = async () => {
    if (!ruleToDelete) return;

    try {
      await apiClient.delete(API_ENDPOINTS.DELETE_RULE(ruleToDelete._id));
      showSnackbar("Rule deleted successfully");
      loadRules();
      setShowDeleteDialog(false);
      setRuleToDelete(null);
    } catch (error) {
      console.error("Error deleting rule:", error);
      showSnackbar(
        error.response?.data?.message || "Failed to delete rule",
        "error",
      );
    }
  };

  const handleToggleStatus = async (rule) => {
    const newStatus = rule.status === "active" ? "inactive" : "active";
    // Optimistic update
    setRules((prev) =>
      prev.map((r) => (r._id === rule._id ? { ...r, status: newStatus } : r)),
    );
    try {
      await apiClient.patch(API_ENDPOINTS.TOGGLE_RULE_STATUS(rule._id), {
        status: newStatus,
      });
      showSnackbar(
        `Rule ${newStatus === "active" ? "activated" : "deactivated"} successfully`,
      );
    } catch (error) {
      // Revert on failure
      setRules((prev) =>
        prev.map((r) =>
          r._id === rule._id ? { ...r, status: rule.status } : r,
        ),
      );
      console.error("Error toggling rule status:", error);
      showSnackbar(
        error.response?.data?.message || "Failed to update rule status",
        "error",
      );
    }
  };

  const handleTestRule = (rule) => {
    setTestRule(rule);
    setTestData(
      JSON.stringify(
        {
          ...(rule.category === "leave" && {
            days: 5,
            leaveType: "PL",
            sick_leave: false,
            availablePL: 10,
          }),
          ...(rule.category === "attendance" && {
            workingHours: 8,
            timeIn: "09:00",
            timeOut: "18:00",
            correctionsUsed: 1,
          }),
        },
        null,
        2,
      ),
    );
    setTestResult(null);
    setShowTestDialog(true);
  };

  const executeTest = async () => {
    try {
      const parsedTestData = JSON.parse(testData);
      const response = await apiClient.post(API_ENDPOINTS.TEST_RULE, {
        rule: testRule,
        testData: parsedTestData,
      });
      setTestResult(response.data.data);
      showSnackbar("Rule test completed");
    } catch (error) {
      console.error("Error testing rule:", error);
      setTestResult({
        error: error.response?.data?.message || error.message || "Test failed",
      });
      showSnackbar("Test failed", "error");
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleExportRules = () => {
    const dataStr = JSON.stringify(filteredRules, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rules-all-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showSnackbar("Rules exported successfully");
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "active":
        return <ActiveIcon fontSize="small" sx={{ color: "success.main" }} />;
      case "inactive":
        return <InactiveIcon fontSize="small" sx={{ color: "error.main" }} />;
      case "draft":
        return <DraftIcon fontSize="small" sx={{ color: "warning.main" }} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "success";
      case "inactive":
        return "error";
      case "draft":
        return "warning";
      default:
        return "default";
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case "attendance":
        return "primary";
      case "leave":
        return "secondary";
      default:
        return "default";
    }
  };

  const getCategoryIcon = (category) => {
    const cat = categories.find((c) => c.value === category);
    return cat?.icon || "📋";
  };

  // Calculate stats based on all rules
  const stats = {
    total: rules.length,
    active: rules.filter((r) => r.status === "active").length,
    inactive: rules.filter((r) => r.status === "inactive").length,
    draft: rules.filter((r) => r.status === "draft").length,
  };

  return (
    <Box>
      {/* Compact Stats Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {[
          {
            label: "Total Rules",
            value: stats.total,
            bgLight: "#BBDEFB",
            colorLight: "#0D47A1",
            bgDark: "#1A2A42",
            colorDark: "#90CAF9",
          },
          {
            label: "Active",
            value: stats.active,
            bgLight: "#C8E6C9",
            colorLight: "#2E7D32",
            bgDark: "#1E3B2D",
            colorDark: "#A5D6A7",
          },
          {
            label: "Inactive",
            value: stats.inactive,
            bgLight: "#FF8787",
            colorLight: "#AD1457",
            bgDark: "#36192A",
            colorDark: "#F48FB1",
          },
          {
            label: "Draft",
            value: stats.draft,
            bgLight: "#FFE0B2",
            colorLight: "#E65100",
            bgDark: "#3D2A1A",
            colorDark: "#FFCC80",
          },
        ].map((stat, idx) => (
          <Grid item xs={6} sm={3} key={idx}>
            <Paper
              sx={{
                p: 1.5,
                textAlign: "center",
                background: (theme) =>
                  theme.palette.mode === "light" ? stat.bgLight : stat.bgDark,
                border: "none",
                borderRadius: 2,
                transition: "all 0.2s ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: (theme) =>
                    theme.palette.mode === "light"
                      ? `0 4px 12px ${stat.colorLight}30`
                      : `0 4px 12px ${stat.colorDark}30`,
                },
              }}
            >
              <Typography
                variant="h4"
                sx={{
                  color: (theme) =>
                    theme.palette.mode === "light"
                      ? stat.colorLight
                      : stat.colorDark,
                }}
                fontWeight={600}
              >
                {stat.value}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: (theme) =>
                    theme.palette.mode === "light" ? "#333" : "#fff",
                  fontSize: "0.75rem",
                }}
              >
                {stat.label}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Main Content Card */}
      <Card
        sx={{
          background: "var(--card-background)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          borderRadius: 2,
        }}
      >
        <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
          {/* Compact Filters */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{ mb: 2 }}
          >
            <TextField
              size="small"
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ flexGrow: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={categoryFilter}
                label="Category"
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <MenuItem value="all">All Categories</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
                startAdornment={
                  <FilterIcon fontSize="small" sx={{ mr: 0.5 }} />
                }
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
              </Select>
            </FormControl>
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={loadRules} disabled={loading}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export">
                <IconButton size="small" onClick={handleExportRules}>
                  <ExportIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Create Rule">
                <IconButton size="small" onClick={handleCreateVisualRule}>
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Rules Table */}
          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 300,
              }}
            >
              <CircularProgress size={40} />
            </Box>
          ) : (
            <>
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Rule</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        Description
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Category
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Priority
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Status
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Conditions
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Actions
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Modified
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Controls
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center">
                          <Box sx={{ py: 4 }}>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              gutterBottom
                            >
                              {searchQuery ||
                              statusFilter !== "all" ||
                              categoryFilter !== "all"
                                ? "No rules match your filters"
                                : "No rules found. Create your first rule!"}
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRules
                        .slice(
                          page * rowsPerPage,
                          page * rowsPerPage + rowsPerPage,
                        )
                        .map((rule) => (
                          <TableRow
                            key={rule._id}
                            hover
                            sx={{
                              opacity: rule.status === "inactive" ? 0.6 : 1,
                              transition: "all 0.2s ease",
                            }}
                          >
                            <TableCell>
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                              >
                                {getStatusIcon(rule.status)}
                                <Box>
                                  <Typography
                                    variant="body2"
                                    fontWeight={500}
                                    sx={{ lineHeight: 1.3 }}
                                  >
                                    {rule.name}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    {rule._id?.slice(-8) ?? ""}
                                  </Typography>
                                </Box>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  maxWidth: 200,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {rule.description || "—"}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                  >
                                    <span>
                                      {getCategoryIcon(rule.category)}
                                    </span>
                                    <span>
                                      {categories.find(
                                        (c) => c.value === rule.category,
                                      )?.label || rule.category}
                                    </span>
                                  </Stack>
                                }
                                size="small"
                                color={getCategoryColor(rule.category)}
                                sx={{ height: 24, fontSize: "0.7rem" }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={rule.priority}
                                size="small"
                                variant="outlined"
                                sx={{ height: 22, fontSize: "0.7rem" }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={rule.status?.toUpperCase() || "—"}
                                size="small"
                                color={getStatusColor(rule.status)}
                                sx={{ height: 22, fontSize: "0.7rem" }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={rule.conditions?.length || 0}
                                size="small"
                                variant="outlined"
                                color="info"
                                sx={{ height: 22, fontSize: "0.7rem" }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={rule.actions?.length || 0}
                                size="small"
                                variant="outlined"
                                color="warning"
                                sx={{ height: 22, fontSize: "0.7rem" }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {rule.updatedAt
                                  ? new Date(rule.updatedAt).toLocaleDateString(
                                      "en-US",
                                      { month: "short", day: "numeric" },
                                    )
                                  : "—"}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Stack
                                direction="row"
                                spacing={0.5}
                                justifyContent="center"
                              >
                                <Tooltip
                                  title={
                                    rule.status === "active"
                                      ? "Deactivate"
                                      : "Activate"
                                  }
                                >
                                  <Switch
                                    size="small"
                                    checked={rule.status === "active"}
                                    onChange={() => handleToggleStatus(rule)}
                                    sx={{ m: 0 }}
                                  />
                                </Tooltip>
                                <Tooltip title="Edit">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleEditRule(rule)}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Test">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleTestRule(rule)}
                                  >
                                    <TestIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDeleteClick(rule)}
                                    color="error"
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {filteredRules.length > 0 && (
                <TablePagination
                  rowsPerPageOptions={[5, 10, 25, 50]}
                  component="div"
                  count={filteredRules.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  sx={{ borderTop: "1px solid var(--text-input-border)" }}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Category Selection Dialog */}
      <Dialog
        open={showCategoryDialog}
        onClose={() => setShowCategoryDialog(false)}
        maxWidth="xs"
        fullWidth
        disablePortal
        PaperProps={{
          sx: {
            borderRadius: 2,
            background: "var(--card-background)",
            boxShadow: 24,
          },
        }}
        BackdropProps={{
          sx: {
            backgroundColor: "rgba(0, 0, 0, 0.7)",
          },
        }}
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={600}>
            Select Category
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 1, mt: 2 }}>
          <FormControl component="fieldset" fullWidth>
            <RadioGroup
              value={selectedCategoryForCreation}
              onChange={(e) => setSelectedCategoryForCreation(e.target.value)}
            >
              {categories.map((cat) => (
                <FormControlLabel
                  key={cat.value}
                  value={cat.value}
                  control={<Radio />}
                  label={
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <span>{cat.icon}</span>
                      <Typography variant="body1" fontWeight={500}>
                        {cat.label}
                      </Typography>
                    </Stack>
                  }
                  sx={{
                    border: "2px solid",
                    borderColor:
                      selectedCategoryForCreation === cat.value
                        ? "primary.main"
                        : "var(--text-input-border)",
                    borderRadius: 2,
                    m: 0,
                    mb: 1,
                    p: 1.5,
                    bgcolor:
                      selectedCategoryForCreation === cat.value
                        ? "action.selected"
                        : "transparent",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: "primary.main",
                      bgcolor: "action.hover",
                    },
                  }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button variant="ghost" onClick={() => setShowCategoryDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirmCategorySelection}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Test Dialog */}
      <Dialog
        open={showTestDialog}
        onClose={() => setShowTestDialog(false)}
        maxWidth="lg"
        fullWidth
        disablePortal
        PaperProps={{
          sx: {
            borderRadius: 2,
            background: "var(--card-background)",
            height: "80vh",
            maxHeight: "800px",
          },
        }}
      >
        <DialogTitle
          sx={{ pb: 1.5, borderBottom: "1px solid var(--text-input-border)" }}
        >
          <Typography variant="h6" fontWeight={600}>
            Test Rule: {testRule?.name}
          </Typography>
        </DialogTitle>
        <DialogContent
          sx={{
            p: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Grid container sx={{ flex: 1, overflow: "hidden" }}>
            {/* Input Section */}
            <Grid
              item
              xs={12}
              md={6}
              sx={{
                borderRight: { md: "1px solid var(--text-input-border)" },
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  p: 2,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Test Data Input
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mb: 1.5 }}
                >
                  Enter test data in JSON format:
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  value={testData}
                  onChange={(e) => setTestData(e.target.value)}
                  placeholder='{\n  "key": "value"\n}'
                  sx={{
                    flex: 1,
                    "& .MuiInputBase-root": {
                      height: "100%",
                      alignItems: "flex-start",
                      fontFamily: "monospace",
                      fontSize: "0.813rem",
                      bgcolor: "background.default",
                    },
                    "& .MuiInputBase-input": {
                      height: "100% !important",
                      overflow: "auto !important",
                    },
                  }}
                />
              </Box>
            </Grid>

            {/* Result Section */}
            <Grid
              item
              xs={12}
              md={6}
              sx={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  p: 2,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Test Result
                </Typography>
                {testResult ? (
                  <Box
                    sx={{
                      flex: 1,
                      mt: 1,
                      p: 2,
                      border: "1px solid",
                      borderColor:
                        testResult.error || testResult.matched === false
                          ? "error.main"
                          : "success.main",
                      borderRadius: 1,
                      bgcolor:
                        testResult.error || testResult.matched === false
                          ? "rgba(211, 47, 47, 0.1)"
                          : "rgba(46, 125, 50, 0.1)",
                      overflow: "auto",
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "monospace",
                        fontSize: "0.813rem",
                        color: "inherit",
                      }}
                    >
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px dashed var(--text-input-border)",
                      borderRadius: 1,
                      mt: 1,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Click "Run Test" to see results
                    </Typography>
                  </Box>
                )}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions
          sx={{ p: 2, borderTop: "1px solid var(--text-input-border)" }}
        >
          <Button variant="ghost" onClick={() => setShowTestDialog(false)}>
            Close
          </Button>
          <Button onClick={executeTest}>Run Test</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        maxWidth="xs"
        disablePortal
        PaperProps={{
          sx: {
            borderRadius: 2,
            background: "var(--card-background)",
          },
        }}
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={600}>
            Confirm Delete
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete{" "}
            <strong>{ruleToDelete?.name}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDeleteRule}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default RuleList;
