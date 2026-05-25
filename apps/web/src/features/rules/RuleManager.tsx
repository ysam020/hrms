import { useState } from "react";
import Box from "@mui/material/Box";
import RuleList from "./RuleList";
import VisualRuleBuilder from "./VisualRuleBuilder";

const RuleManager = () => {
  const [viewMode, setViewMode] = useState("list");
  const [selectedCategory, setSelectedCategory] = useState("attendance");
  const [selectedRule, setSelectedRule] = useState(null);
  const [templateData, setTemplateData] = useState(null);

  const handleEditRule = (rule) => {
    setSelectedRule(rule);
    setSelectedCategory(rule.category || "attendance");
    setTemplateData(null);
    setViewMode("visual");
  };

  const handleCreateRule = (category, ruleData = null) => {
    setSelectedRule(null);
    setSelectedCategory(category);
    setTemplateData(ruleData);
    setViewMode("visual");
  };

  const handleSaveRule = () => {
    setViewMode("list");
    setSelectedRule(null);
    setTemplateData(null);
  };

  const handleCancel = () => {
    setViewMode("list");
    setSelectedRule(null);
    setTemplateData(null);
  };

  return (
    <Box sx={{ p: 1, minHeight: "100vh" }}>
      {viewMode === "list" && (
        <RuleList onEditRule={handleEditRule} onCreateRule={handleCreateRule} />
      )}

      {viewMode === "visual" && (
        <VisualRuleBuilder
          category={selectedCategory}
          existingRule={selectedRule}
          templateData={templateData}
          onSave={handleSaveRule}
          onCancel={handleCancel}
        />
      )}
    </Box>
  );
};

export default RuleManager;
