import { useState } from "react";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Chip,
  Grid,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Collapse,
} from "@mui/material";
import {
  Search as SearchIcon,
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from "@mui/icons-material";
import {
  getTemplatesByCategory,
  createRuleFromTemplate,
  RULE_METADATA,
} from "./RuleDefinitions";

const RuleTemplateSelector = ({
  open,
  onClose,
  onSelectTemplate,
  category: initialCategory = "attendance",
}) => {
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCard, setExpandedCard] = useState(null);

  const templates = getTemplatesByCategory(selectedCategory);
  const metadata = RULE_METADATA[selectedCategory] || {};

  const filteredTemplates = templates.filter(
    (template) =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags?.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  );

  const handleSelectTemplate = (template) => {
    const rule = createRuleFromTemplate(template);
    onSelectTemplate(rule, template);
    onClose();
  };

  const handleCategoryChange = (event, newValue) => {
    setSelectedCategory(newValue);
    setSearchQuery("");
    setExpandedCard(null);
  };

  const toggleCardExpansion = (templateId) => {
    setExpandedCard(expandedCard === templateId ? null : templateId);
  };

  const renderConditionSummary = (conditions, logic) => {
    if (!conditions || conditions.length === 0) return "No conditions";

    return conditions.map((cond, idx) => (
      <Box key={idx} sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {idx > 0 && `${logic} `}
          <strong>{cond.field}</strong> {cond.operator.replace(/_/g, " ")}{" "}
          <strong>{String(cond.value)}</strong>
        </Typography>
      </Box>
    ));
  };

  const renderActionSummary = (actions) => {
    if (!actions || actions.length === 0) return "No actions";

    return actions.map((action, idx) => (
      <Box key={idx} sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="primary">
          • {action.type.toUpperCase()}
          {action.field && `: ${action.field}`}
          {action.value && ` = ${action.value}`}
        </Typography>
      </Box>
    ));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slots={{ transition: SlideUpTransition }}
      transitionDuration={{ enter: 280, exit: 200 }}
      aria-labelledby="template-selector-title"
      PaperProps={{
        sx: { minHeight: "70vh", maxHeight: "90vh" },
      }}
    >
      <DialogTitle id="template-selector-title">
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box>
            <Typography variant="h5" gutterBottom>
              Select a Rule Template
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Choose from predefined business rules or create from scratch
            </Typography>
          </Box>
          <Chip
            icon={<span>{metadata.icon}</span>}
            label={`${filteredTemplates.length} templates`}
            color="primary"
            variant="outlined"
          />
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Category Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
          <Tabs value={selectedCategory} onChange={handleCategoryChange}>
            {Object.entries(RULE_METADATA).map(([key, meta]) => (
              <Tab
                key={key}
                value={key}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <span>{meta.icon}</span>
                    <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  </Box>
                }
              />
            ))}
          </Tabs>
        </Box>

        {/* Search Bar */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ mb: 3 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        {/* Template Cards */}
        {filteredTemplates.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No templates found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Try adjusting your search or select a different category
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {filteredTemplates.map((template) => (
              <Grid item xs={12} md={6} key={template.id}>
                <Card
                  variant="outlined"
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    transition: "all 0.2s",
                    "&:hover": {
                      boxShadow: 3,
                      borderColor: "primary.main",
                    },
                  }}
                >
                  <CardContent sx={{ flexGrow: 1 }}>
                    {/* Header */}
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        mb: 2,
                      }}
                    >
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="h6" gutterBottom>
                          {template.name}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mb: 1 }}
                        >
                          {template.description}
                        </Typography>
                      </Box>
                      <Tooltip title="View details">
                        <IconButton
                          size="small"
                          aria-label={
                            expandedCard === template.id
                              ? `Collapse ${template.name} details`
                              : `Expand ${template.name} details`
                          }
                          aria-expanded={expandedCard === template.id}
                          onClick={() => toggleCardExpansion(template.id)}
                        >
                          {expandedCard === template.id ? (
                            <ExpandLessIcon aria-hidden="true" />
                          ) : (
                            <ExpandMoreIcon aria-hidden="true" />
                          )}
                        </IconButton>
                      </Tooltip>
                    </Box>

                    {/* Tags */}
                    <Box
                      sx={{
                        display: "flex",
                        gap: 0.5,
                        flexWrap: "wrap",
                        mb: 2,
                      }}
                    >
                      {template.tags?.map((tag, idx) => (
                        <Chip
                          key={idx}
                          label={tag}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>

                    {/* Quick Info */}
                    <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
                      <Chip
                        size="small"
                        label={`${template.conditions?.length || 0} conditions`}
                        color="info"
                        variant="outlined"
                      />
                      <Chip
                        size="small"
                        label={`${template.actions?.length || 0} actions`}
                        color="warning"
                        variant="outlined"
                      />
                      <Chip
                        size="small"
                        label={`Priority: ${template.priority}`}
                        color="default"
                        variant="outlined"
                      />
                    </Box>

                    {/* Expandable Details */}
                    <Collapse in={expandedCard === template.id}>
                      <Box
                        sx={{
                          mt: 2,
                          pt: 2,
                          borderTop: 1,
                          borderColor: "divider",
                        }}
                      >
                        <Typography variant="subtitle2" gutterBottom>
                          Conditions ({template.conditionLogic}):
                        </Typography>
                        <Box sx={{ pl: 2, mb: 2 }}>
                          {renderConditionSummary(
                            template.conditions,
                            template.conditionLogic,
                          )}
                        </Box>

                        <Typography variant="subtitle2" gutterBottom>
                          Actions:
                        </Typography>
                        <Box sx={{ pl: 2 }}>
                          {renderActionSummary(template.actions)}
                        </Box>
                      </Box>
                    </Collapse>
                  </CardContent>

                  <CardActions sx={{ p: 2, pt: 0 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={() => handleSelectTemplate(template)}
                    >
                      Use This Template
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="outlined"
          onClick={() => {
            onSelectTemplate(null, null);
            onClose();
          }}
        >
          Create From Scratch
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RuleTemplateSelector;
