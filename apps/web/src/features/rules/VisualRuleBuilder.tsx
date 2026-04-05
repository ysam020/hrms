import { useCallback, useState, useEffect, useContext } from "react";
import ReactFlow, {
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Collapse from "@mui/material/Collapse";

import ConditionIcon from "@mui/icons-material/AccountTree";
import ActionIcon from "@mui/icons-material/FlashOn";
import StartIcon from "@mui/icons-material/PlayArrow";
import EndIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";

import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { InputTextarea } from "primereact/inputtextarea";
import "primereact/resources/primereact.min.css";
import apiClient from "@web/core/http/axiosConfig";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Button from "@web/shared/components/Button";

// Custom Node Components
import ConditionNode from "./nodes/ConditionNode";
import ActionNode from "./nodes/ActionNode";
import StartNode from "./nodes/StartNode";
import EndNode from "./nodes/EndNode";
import { API_ENDPOINTS } from "@web/shared/constants";

const nodeTypes = {
  start: StartNode,
  condition: ConditionNode,
  action: ActionNode,
  end: EndNode,
};

// Field configurations for attendance and leave
const FIELD_CONFIGS = {
  leave: [
    { name: "sick_leave", label: "Sick Leave", type: "boolean" },
    { name: "carryForwardDays", label: "Carry Forward Days", type: "number" },
    {
      name: "medical_certificate",
      label: "Medical Certificate",
      type: "string",
    },
  ],
  attendance: [
    { name: "workingHours", label: "Working Hours", type: "number" },
    { name: "correctionsUsed", label: "Corrections Used", type: "number" },
  ],
};

// Action field configurations (for transform actions)
const ACTION_FIELD_CONFIGS = {
  leave: [
    { name: "sick_leave", label: "Sick Leave", type: "boolean" },
    {
      name: "medical_certificate",
      label: "Medical Certificate",
      type: "string",
    },
    { name: "carryForwardDays", label: "Carry Forward Days", type: "number" },
  ],
  attendance: [
    { name: "workingHours", label: "Working Hours", type: "number" },
    { name: "correctionsUsed", label: "Corrections Used", type: "number" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: ["Present", "Absent", "Half Day", "Leave", "Holiday"],
    },
  ],
};

const OPERATORS = [
  { value: "equals", label: "Equals (=)" },
  { value: "greater_than", label: "Greater Than (>)" },
  { value: "less_than", label: "Less Than (<)" },
  { value: "greater_or_equal", label: "Greater or Equal (≥)" },
  { value: "less_or_equal", label: "Less or Equal (≤)" },
  { value: "between", label: "Between" },
  { value: "not_between", label: "Not Between" },
];

const ACTION_TYPES = [
  { value: "block", label: "Block Action", icon: "🚫", fields: ["message"] },
  {
    value: "transform",
    label: "Transform Data",
    icon: "🔄",
    fields: ["field", "value", "message"],
  },
];

const CATEGORIES = [
  { value: "attendance", label: "Attendance", icon: "📅" },
  { value: "leave", label: "Leave Management", icon: "🏖️" },
];

const VisualRuleBuilder = ({
  category: initialCategory = "attendance",
  existingRule,
  templateData,
  onSave,
  onCancel,
}) => {
  return (
    <ReactFlowProvider>
      <VisualRuleBuilderInner
        initialCategory={initialCategory}
        existingRule={existingRule}
        templateData={templateData}
        onSave={onSave}
        onCancel={onCancel}
      />
    </ReactFlowProvider>
  );
};

const VisualRuleBuilderInner = ({
  initialCategory = "attendance",
  existingRule,
  templateData,
  onSave,
  onCancel,
}) => {
  const reactFlowInstance = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [showNodeEditor, setShowNodeEditor] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [saving, setSaving] = useState(false);
  const { theme } = useContext(ThemeContext);

  const [rule, setRule] = useState<{
    name: string;
    category: string;
    conditions: any[];
    conditionLogic: string;
    actions: any[];
    priority: number;
    status: string;
    tags: any[];
    templateId?: string;
  }>({
    name: "",
    category: initialCategory,
    conditions: [],
    conditionLogic: "AND",
    actions: [],
    priority: 5,
    status: "draft",
    tags: [],
  });

  const [nodeConfig, setNodeConfig] = useState({
    field: "",
    operator: "equals",
    value: "",
    valueTo: "", // Added for between operator
    actionType: "block",
    message: "",
    actionField: "",
    actionValue: "",
  });

  // Function to convert rule JSON to visual flow
  const convertRuleToVisualFlow = useCallback(
    (ruleData) => {
      const generatedNodes: any[] = [];
      const generatedEdges: any[] = [];
      let yOffset = 50;
      const xPosition = 250;
      const nodeSpacing = 120;

      // Start Node
      const startNode = {
        id: "start-1",
        type: "start",
        position: { x: xPosition, y: yOffset },
        data: { label: "Start" },
      };
      generatedNodes.push(startNode);
      let lastNodeId = startNode.id;
      yOffset += nodeSpacing;

      // Add Condition Nodes
      if (ruleData.conditions && ruleData.conditions.length > 0) {
        ruleData.conditions.forEach((condition, index) => {
          let conditionLabel = "";
          if (
            condition.operator === "between" ||
            condition.operator === "not_between"
          ) {
            conditionLabel = `IF ${condition.field} ${condition.operator} ${condition.value} and ${condition.valueTo}`;
          } else {
            conditionLabel = `IF ${condition.field} ${condition.operator} ${condition.value}`;
          }

          const conditionNode = {
            id: `condition-${Date.now()}-${index}`,
            type: "condition",
            position: { x: xPosition, y: yOffset },
            data: {
              label: conditionLabel,
              condition: {
                field: condition.field,
                operator: condition.operator,
                value: condition.value,
                valueTo: condition.valueTo,
              },
            },
          };
          generatedNodes.push(conditionNode);

          // Connect previous node to this condition
          generatedEdges.push({
            id: `edge-${lastNodeId}-${conditionNode.id}`,
            source: lastNodeId,
            target: conditionNode.id,
            type: "default",
            animated: true,
            style: {
              stroke: theme === "light" ? "#b1b1b7" : "#e8e8eaff",
              strokeWidth: 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: theme === "light" ? "#b1b1b7" : "#6b7280",
            },
          });

          lastNodeId = conditionNode.id;
          yOffset += nodeSpacing;
        });
      }

      // Add Action Nodes
      if (ruleData.actions && ruleData.actions.length > 0) {
        ruleData.actions.forEach((action, index) => {
          const actionLabel =
            action.type === "transform" && action.field
              ? `${action.type.toUpperCase()}: ${action.field}`
              : action.type.toUpperCase();

          const actionNode = {
            id: `action-${Date.now()}-${index}`,
            type: "action",
            position: { x: xPosition, y: yOffset },
            data: {
              label: actionLabel,
              action: {
                type: action.type,
                message: action.message || "",
                field: action.field || "",
                value: action.value !== undefined ? action.value : "",
              },
            },
          };
          generatedNodes.push(actionNode);

          // Connect previous node to this action
          // If previous was a condition, connect via "true" handle
          const sourceHandle =
            generatedNodes[generatedNodes.length - 2]?.type === "condition"
              ? "true"
              : undefined;

          generatedEdges.push({
            id: `edge-${lastNodeId}-${actionNode.id}`,
            source: lastNodeId,
            target: actionNode.id,
            sourceHandle: sourceHandle,
            type: "default",
            animated: true,
            style: {
              stroke: theme === "light" ? "#b1b1b7" : "#e8e8eaff",
              strokeWidth: 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: theme === "light" ? "#b1b1b7" : "#6b7280",
            },
            label: sourceHandle === "true" ? "Yes" : "",
            labelStyle: {
              fill: theme === "light" ? "#374151" : "#e5e7eb",
              fontWeight: 600,
              fontSize: 12,
            },
            labelBgStyle: {
              fill: theme === "light" ? "#ffffff" : "#1f2937",
              fillOpacity: 0.8,
            },
          });

          lastNodeId = actionNode.id;
          yOffset += nodeSpacing;
        });
      }

      // End Node
      const endNode = {
        id: "end-1",
        type: "end",
        position: { x: xPosition, y: yOffset },
        data: { label: "End" },
      };
      generatedNodes.push(endNode);

      // Connect last node to end
      generatedEdges.push({
        id: `edge-${lastNodeId}-${endNode.id}`,
        source: lastNodeId,
        target: endNode.id,
        type: "default",
        animated: true,
        style: {
          stroke: theme === "light" ? "#b1b1b7" : "#e8e8eaff",
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: theme === "light" ? "#b1b1b7" : "#6b7280",
        },
      });

      return { nodes: generatedNodes, edges: generatedEdges };
    },
    [theme],
  );

  useEffect(() => {
    if (existingRule) {
      setRuleName(existingRule.name || "");
      setCategory(existingRule.category || initialCategory);
      setRule((prev) => ({
        ...prev,
        ...existingRule,
      }));

      // Check if visual flow exists, otherwise generate from rule JSON
      if (
        existingRule.visualFlow &&
        existingRule.visualFlow.nodes &&
        existingRule.visualFlow.nodes.length > 0
      ) {
        setNodes(existingRule.visualFlow.nodes);
        setEdges(existingRule.visualFlow.edges || []);
      } else {
        // Generate visual flow from rule conditions and actions
        const { nodes: generatedNodes, edges: generatedEdges } =
          convertRuleToVisualFlow(existingRule);
        setNodes(generatedNodes);
        setEdges(generatedEdges);
      }
    } else if (templateData) {
      setRuleName(templateData.name || "");
      setCategory(templateData.category || initialCategory);
      setRule((prev) => ({
        ...prev,
        name: templateData.name || "",
        category: templateData.category || initialCategory,
        conditions: templateData.conditions || [],
        conditionLogic: templateData.conditionLogic || "AND",
        actions: templateData.actions || [],
        priority: templateData.priority || 5,
        status: "draft",
        tags: templateData.tags || [],
      }));

      // Generate visual flow from template data
      const { nodes: generatedNodes, edges: generatedEdges } =
        convertRuleToVisualFlow(templateData);
      setNodes(generatedNodes);
      setEdges(generatedEdges);
    } else {
      const startNode = {
        id: "start-1",
        type: "start",
        position: { x: 250, y: 50 },
        data: { label: "Start" },
      };
      setNodes([startNode]);
    }
  }, [
    existingRule,
    templateData,
    initialCategory,
    setNodes,
    setEdges,
    convertRuleToVisualFlow,
  ]);

  const availableFields = FIELD_CONFIGS[category] || [];

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "default",
            animated: true,
            style: {
              stroke: theme === "light" ? "#b1b1b7" : "#e8e8eaff",
              strokeWidth: 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: theme === "light" ? "#b1b1b7" : "#6b7280",
            },
            label:
              params.sourceHandle === "false"
                ? "No"
                : params.sourceHandle === "true"
                  ? "Yes"
                  : "",
            labelStyle: {
              fill: theme === "light" ? "#374151" : "#e5e7eb",
              fontWeight: 600,
              fontSize: 12,
            },
            labelBgStyle: {
              fill: theme === "light" ? "#ffffff" : "#1f2937",
              fillOpacity: 0.8,
            },
          },
          eds,
        ),
      ),
    [setEdges, theme],
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");

      if (!type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: {
          label: `${type} node`,
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes],
  );

  const onNodeClick = (event, node) => {
    setSelectedNode(node);
    if (node.type === "condition" || node.type === "action") {
      setNodeConfig({
        field: node.data.condition?.field || "",
        operator: node.data.condition?.operator || "equals",
        value: node.data.condition?.value || "",
        valueTo: node.data.condition?.valueTo || "", // Added this
        actionType: node.data.action?.type || "block",
        message: node.data.action?.message || "",
        actionField: node.data.action?.field || "",
        actionValue: node.data.action?.value || "",
      });
      setShowNodeEditor(true);
    }
  };

  const handleNodeUpdate = () => {
    if (!selectedNode) return;

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id) {
          if (node.type === "condition") {
            const conditionData: {
              field: string;
              operator: string;
              value: string;
              valueTo?: string;
            } = {
              field: nodeConfig.field,
              operator: nodeConfig.operator,
              value: nodeConfig.value,
            };

            // Add valueTo for between operators
            if (
              nodeConfig.operator === "between" ||
              nodeConfig.operator === "not_between"
            ) {
              conditionData.valueTo = nodeConfig.valueTo;
            }

            const label =
              nodeConfig.operator === "between" ||
              nodeConfig.operator === "not_between"
                ? `IF ${nodeConfig.field} ${nodeConfig.operator} ${nodeConfig.value} and ${nodeConfig.valueTo}`
                : `IF ${nodeConfig.field} ${nodeConfig.operator} ${nodeConfig.value}`;

            return {
              ...node,
              data: {
                ...node.data,
                condition: conditionData,
                label: label,
              },
            };
          } else if (node.type === "action") {
            const actionData: {
              type: string;
              message: string;
              field?: string;
              value?: any;
            } = {
              type: nodeConfig.actionType,
              message: nodeConfig.message,
            };

            if (nodeConfig.actionType === "transform") {
              actionData.field = nodeConfig.actionField;
              actionData.value = nodeConfig.actionValue;
            }

            return {
              ...node,
              data: {
                ...node.data,
                action: actionData,
                label: `${nodeConfig.actionType.toUpperCase()}${
                  nodeConfig.actionField ? `: ${nodeConfig.actionField}` : ""
                }`,
              },
            };
          }
        }
        return node;
      }),
    );
    setShowNodeEditor(false);
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          edge.source !== selectedNode.id && edge.target !== selectedNode.id,
      ),
    );
    setShowNodeEditor(false);
    setSelectedNode(null);
  };

  const convertToRuleDefinition = () => {
    const conditions: any[] = [];
    const actions: any[] = [];

    nodes.forEach((node) => {
      if (node.type === "condition" && node.data.condition) {
        // Find the field configuration to determine the correct type
        const fieldConfig = availableFields.find(
          (f) => f.name === node.data.condition.field,
        );

        let value = node.data.condition.value;
        let valueType = "string";

        // Convert value based on field type
        if (fieldConfig) {
          if (fieldConfig.type === "boolean") {
            // Convert string "true"/"false" to boolean
            if (typeof value === "string") {
              value = value.toLowerCase() === "true";
            }
            valueType = "boolean";
          } else if (fieldConfig.type === "number") {
            value = Number(value);
            valueType = "number";
          } else {
            valueType = "string";
          }
        } else {
          // Fallback to typeof check if field config not found
          if (typeof value === "boolean") {
            valueType = "boolean";
          } else if (typeof value === "number") {
            valueType = "number";
          }
        }

        const condition: {
          field: string;
          operator: string;
          value: any;
          valueType: string;
          valueTo?: any;
        } = {
          field: node.data.condition.field,
          operator: node.data.condition.operator,
          value: value,
          valueType: valueType,
        };

        // Add valueTo for between operators
        if (
          node.data.condition.valueTo !== undefined &&
          node.data.condition.valueTo !== ""
        ) {
          let valueTo = node.data.condition.valueTo;
          // Convert valueTo based on field type as well
          if (fieldConfig?.type === "number") {
            valueTo = Number(valueTo);
          }
          condition.valueTo = valueTo;
        }

        conditions.push(condition);
      } else if (node.type === "action" && node.data.action) {
        const action: {
          type: string;
          message: string;
          field?: string;
          value?: any;
        } = {
          type: node.data.action.type,
          message: node.data.action.message,
        };

        if (node.data.action.field) {
          action.field = node.data.action.field;
        }

        if (
          node.data.action.value !== undefined &&
          node.data.action.value !== ""
        ) {
          action.value = node.data.action.value;
        }

        actions.push(action);
      }
    });

    return {
      name: ruleName || rule.name || "Untitled Visual Rule",
      category,
      conditions: conditions.length > 0 ? conditions : rule.conditions,
      conditionLogic: rule.conditionLogic || "AND",
      actions: actions.length > 0 ? actions : rule.actions,
      priority: rule.priority || 5,
      status: rule.status || "draft",
      tags: rule.tags || ["visual"],
      visualFlow: {
        nodes,
        edges,
      },
      templateId: rule.templateId || undefined,
    };
  };

  const handleSave = async () => {
    if (!ruleName) {
      alert("Please enter a rule name");
      return;
    }

    if (nodes.length === 0) {
      alert("Please add some nodes to your rule");
      return;
    }

    try {
      setSaving(true);
      const ruleDefinition = convertToRuleDefinition();

      if (existingRule) {
        await apiClient.put(
          API_ENDPOINTS.UPDATE_RULE(existingRule._id),
          ruleDefinition,
        );
      } else {
        await apiClient.post(API_ENDPOINTS.ADD_RULE, ruleDefinition);
      }

      onSave(ruleDefinition);
    } catch (error) {
      console.error("Error saving rule:", error);
      alert(error.response?.data?.message || "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const nodeTemplates = [
    {
      type: "start",
      label: "Start",
      icon: <StartIcon fontSize="small" />,
      color: "#4caf50",
    },
    {
      type: "condition",
      label: "Condition",
      icon: <ConditionIcon fontSize="small" />,
      color: "#2196f3",
    },
    {
      type: "action",
      label: "Action",
      icon: <ActionIcon fontSize="small" />,
      color: "#ff9800",
    },
    {
      type: "end",
      label: "End",
      icon: <EndIcon fontSize="small" />,
      color: "#f44336",
    },
  ];

  // Render field template for dropdown options
  const fieldOptionTemplate = (option) => {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Chip
          label={option.type}
          size="small"
          sx={{
            height: 20,
            fontSize: "0.7rem",
            bgcolor:
              theme === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)",
          }}
        />
        <span>{option.label}</span>
      </div>
    );
  };

  const actionTypeOptionTemplate = (option) => {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "1.25rem" }}>{option.icon}</span>
        <span>{option.label}</span>
      </div>
    );
  };

  return (
    <Box
      sx={{
        display: "flex",
        height: "calc(100vh - 150px)",
        position: "relative",
        bgcolor: theme === "light" ? "#fafafa" : "#1C262B",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {/* Backdrop for modal - Fixed z-index and positioning */}
      {showNodeEditor && (
        <Box
          onClick={() => setShowNodeEditor(false)}
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1300,
            backdropFilter: "blur(4px)",
          }}
        />
      )}

      {/* Sidebar */}
      <Paper
        sx={{
          width: 280,
          minWidth: 280,
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRadius: 0,
          bgcolor: theme === "light" ? "#ffffff" : "#212E35",
          boxShadow:
            theme === "light"
              ? "0 4px 20px rgba(0, 0, 0, 0.1)"
              : "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
        elevation={0}
      >
        {/* Rule Details Section */}
        <Box
          sx={{
            p: 2,
          }}
        >
          <Stack spacing={1.5}>
            <div className="p-fluid">
              <label
                htmlFor="rule-name"
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: theme === "light" ? "#374151" : "#e5e7eb",
                }}
              >
                Rule Name *
              </label>
              <InputText
                id="rule-name"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="Enter rule name"
                className="w-full"
                style={{
                  borderRadius: "0.75rem",
                  fontSize: "0.875rem",
                }}
              />
            </div>
          </Stack>
        </Box>

        <Divider />

        {/* Sidebar Header */}
        <Box
          sx={{
            p: 2,
          }}
        >
          <Typography variant="subtitle1" fontWeight="600" gutterBottom>
            Components
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Drag components to canvas
          </Typography>
        </Box>

        {/* Component List */}
        <Box sx={{ p: 1.5, overflowY: "auto", flex: 1 }}>
          <List dense disablePadding>
            {nodeTemplates.map((template) => (
              <ListItem
                key={template.type}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    "application/reactflow",
                    template.type,
                  );
                  event.dataTransfer.effectAllowed = "move";
                }}
                sx={{
                  cursor: "grab",
                  mb: 1,
                  borderRadius: 1.5,
                  border: "1px solid",
                  borderColor: template.color,
                  bgcolor: template.color + "4f",
                  "&:active": {
                    cursor: "grabbing",
                  },
                  transition: "all 0.2s ease",
                  py: 1,
                  px: 1.5,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 36,
                    color: template.color,
                  }}
                >
                  {template.icon}
                </ListItemIcon>
                <ListItemText
                  primary={template.label}
                  primaryTypographyProps={{
                    fontSize: "0.875rem",
                    fontWeight: 500,
                  }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      </Paper>

      {/* Main Canvas Area */}
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top Toolbar */}
        <Paper
          sx={{
            m: 2,
            p: 1.5,
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: 2,
            bgcolor: theme === "light" ? "#ffffff" : "#212E35",
            boxShadow:
              theme === "light"
                ? "0 2px 8px rgba(0, 0, 0, 0.08)"
                : "0 2px 8px rgba(0, 0, 0, 0.25)",
          }}
          elevation={0}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={
                CATEGORIES.find((c) => c.value === category)?.label || category
              }
              size="small"
              sx={{
                bgcolor: theme === "light" ? "#111b21" : "#0c3f61",
                color: "#fff",
                fontWeight: 500,
                px: 0.5,
              }}
              icon={
                <span style={{ fontSize: "14px", marginLeft: "8px" }}>
                  {CATEGORIES.find((c) => c.value === category)?.icon}
                </span>
              }
            />
            <Divider orientation="vertical" flexItem />
            <Chip
              label={`${nodes.length} Nodes`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${edges.length} Connections`}
              size="small"
              variant="outlined"
            />
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button variant="outline" size="small" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={handleSave}
              loading={saving}
              disabled={!ruleName}
            >
              {saving ? "Saving..." : "Save Rule"}
            </Button>
          </Stack>
        </Paper>

        {/* React Flow Canvas */}
        <Box
          sx={{
            flex: 1,
            mx: 2,
            mb: 2,
            borderRadius: 2,
            overflow: "hidden",
            border: "1px solid",
            borderColor:
              theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
            boxShadow:
              theme === "light"
                ? "0 4px 20px rgba(0, 0, 0, 0.1)"
                : "0 4px 20px rgba(0, 0, 0, 0.3)",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "default",
              animated: true,
              style: {
                stroke: theme === "light" ? "#b1b1b7" : "#dbdde1ff",
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: theme === "light" ? "#b1b1b7" : "#e9eaedff",
              },
            }}
            style={{
              background: theme === "light" ? "#fafafa" : "#1C262B",
            }}
          >
            <Controls
              style={
                {
                  button: {
                    backgroundColor: theme === "light" ? "#ffffff" : "#212E35",
                    borderBottom: `1px solid ${
                      theme === "light"
                        ? "rgba(0,0,0,0.08)"
                        : "rgba(255,255,255,0.08)"
                    }`,
                  },
                } as any
              }
            />
            <Background
              variant={BackgroundVariant.Dots}
              gap={10}
              size={1}
              color={theme === "light" ? "#0d0e0fff" : "#8a8d8fff"}
            />
          </ReactFlow>
        </Box>
      </Box>

      {/* Node Editor Panel - Inline Modal with Fixed z-index */}
      {showNodeEditor && (
        <Paper
          sx={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: "600px",
            maxHeight: "80vh",
            overflow: "auto",
            zIndex: 1400,
            bgcolor: theme === "light" ? "#ffffff" : "#212E35",
            boxShadow:
              theme === "light"
                ? "0 8px 32px rgba(0, 0, 0, 0.15)"
                : "0 8px 32px rgba(0, 0, 0, 0.4)",
            borderRadius: 2,
          }}
          elevation={8}
        >
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: 2.5,
              borderBottom: "1px solid",
              borderColor:
                theme === "light"
                  ? "rgba(0,0,0,0.08)"
                  : "rgba(255,255,255,0.08)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor:
                    selectedNode?.type === "condition"
                      ? "rgba(33, 150, 243, 0.1)"
                      : "rgba(255, 152, 0, 0.1)",
                }}
              >
                {selectedNode?.type === "condition" ? (
                  <ConditionIcon sx={{ color: "#2196f3" }} />
                ) : (
                  <ActionIcon sx={{ color: "#ff9800" }} />
                )}
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={600} sx={{ mb: -0.5 }}>
                  Configure{" "}
                  {selectedNode?.type === "condition" ? "Condition" : "Action"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedNode?.type === "condition"
                    ? "Define the condition logic"
                    : "Set up the action to perform"}
                </Typography>
              </Box>
            </Box>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Delete Node" arrow placement="left">
                <IconButton
                  onClick={handleDeleteNode}
                  size="small"
                  sx={{
                    color: "error.main",
                    bgcolor: "rgba(244, 67, 54, 0.08)",
                    "&:hover": {
                      bgcolor: "rgba(244, 67, 54, 0.16)",
                    },
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close" arrow placement="left">
                <IconButton
                  onClick={() => setShowNodeEditor(false)}
                  size="small"
                  sx={{
                    color: "text.secondary",
                    "&:hover": {
                      bgcolor:
                        theme === "light"
                          ? "rgba(0,0,0,0.04)"
                          : "rgba(255,255,255,0.08)",
                    },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>

          {/* Content */}
          <Box sx={{ p: 2.5 }}>
            {selectedNode?.type === "condition" ? (
              <Stack spacing={2.5}>
                {/* Field Selection */}
                <Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight={600}
                    sx={{
                      mb: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    Field
                    <Chip
                      label="Required"
                      size="small"
                      color="primary"
                      sx={{ height: 18, fontSize: "0.7rem" }}
                    />
                  </Typography>
                  <Dropdown
                    value={nodeConfig.field}
                    onChange={(e) =>
                      setNodeConfig({ ...nodeConfig, field: e.value })
                    }
                    options={availableFields}
                    optionLabel="label"
                    optionValue="name"
                    placeholder="Select a field"
                    className="w-full"
                    itemTemplate={fieldOptionTemplate}
                    appendTo="self"
                    panelClassName="custom-dropdown-panel"
                    style={{
                      borderRadius: "0.75rem",
                      fontSize: "0.875rem",
                    }}
                  />
                </Box>

                {/* Operator Selection */}
                <Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight={600}
                    sx={{
                      mb: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    Operator
                    <Chip
                      label="Required"
                      size="small"
                      color="primary"
                      sx={{ height: 18, fontSize: "0.7rem" }}
                    />
                  </Typography>
                  <Dropdown
                    value={nodeConfig.operator}
                    onChange={(e) =>
                      setNodeConfig({ ...nodeConfig, operator: e.value })
                    }
                    options={OPERATORS}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select an operator"
                    className="w-full"
                    appendTo="self"
                    panelClassName="custom-dropdown-panel"
                    style={{
                      borderRadius: "0.75rem",
                      fontSize: "0.875rem",
                    }}
                  />
                </Box>

                {/* Value Input - Updated to handle between operator */}
                <Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight={600}
                    sx={{
                      mb: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    {nodeConfig.operator === "between" ||
                    nodeConfig.operator === "not_between"
                      ? "Value Range"
                      : "Value"}
                    <Chip
                      label="Required"
                      size="small"
                      color="primary"
                      sx={{ height: 18, fontSize: "0.7rem" }}
                    />
                  </Typography>

                  {nodeConfig.operator === "between" ||
                  nodeConfig.operator === "not_between" ? (
                    // Two inputs for "between" operator
                    <Stack direction="row" spacing={1} alignItems="center">
                      <InputText
                        value={nodeConfig.value}
                        onChange={(e) =>
                          setNodeConfig({
                            ...nodeConfig,
                            value: e.target.value,
                          })
                        }
                        placeholder="From"
                        className="w-full"
                        style={{
                          borderRadius: "0.75rem",
                          fontSize: "0.875rem",
                        }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        to
                      </Typography>
                      <InputText
                        value={nodeConfig.valueTo}
                        onChange={(e) =>
                          setNodeConfig({
                            ...nodeConfig,
                            valueTo: e.target.value,
                          })
                        }
                        placeholder="To"
                        className="w-full"
                        style={{
                          borderRadius: "0.75rem",
                          fontSize: "0.875rem",
                        }}
                      />
                    </Stack>
                  ) : (
                    // Single input for other operators
                    <InputText
                      value={nodeConfig.value}
                      onChange={(e) =>
                        setNodeConfig({ ...nodeConfig, value: e.target.value })
                      }
                      placeholder="Enter comparison value"
                      className="w-full"
                      style={{
                        borderRadius: "0.75rem",
                        fontSize: "0.875rem",
                      }}
                    />
                  )}

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    {nodeConfig.operator === "between" ||
                    nodeConfig.operator === "not_between"
                      ? "Enter the range boundaries (from value to value)"
                      : "The value to compare against the selected field"}
                  </Typography>
                </Box>

                {/* Preview Card - Updated to handle between operator */}
                {nodeConfig.field &&
                  nodeConfig.operator &&
                  nodeConfig.value &&
                  (nodeConfig.operator === "between" ||
                  nodeConfig.operator === "not_between"
                    ? nodeConfig.valueTo
                    : true) && (
                    <Paper
                      sx={{
                        p: 2,
                        bgcolor:
                          theme === "light"
                            ? "rgba(33, 150, 243, 0.05)"
                            : "rgba(33, 150, 243, 0.1)",
                        border: "1px solid",
                        borderColor:
                          theme === "light"
                            ? "rgba(33, 150, 243, 0.2)"
                            : "rgba(33, 150, 243, 0.3)",
                        borderRadius: 2,
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        color="text.secondary"
                        sx={{ mb: 0.5, display: "block" }}
                      >
                        CONDITION PREVIEW
                      </Typography>
                      <Typography variant="body1" fontWeight={500}>
                        IF{" "}
                        <Chip
                          label={nodeConfig.field}
                          size="small"
                          sx={{ mx: 0.5 }}
                        />{" "}
                        <Chip
                          label={
                            OPERATORS.find(
                              (o) => o.value === nodeConfig.operator,
                            )?.label
                          }
                          size="small"
                          sx={{ mx: 0.5 }}
                        />{" "}
                        {nodeConfig.operator === "between" ||
                        nodeConfig.operator === "not_between" ? (
                          <>
                            <Chip
                              label={nodeConfig.value}
                              size="small"
                              sx={{ mx: 0.5 }}
                            />
                            <span style={{ margin: "0 4px" }}>and</span>
                            <Chip
                              label={nodeConfig.valueTo}
                              size="small"
                              sx={{ mx: 0.5 }}
                            />
                          </>
                        ) : (
                          <Chip
                            label={nodeConfig.value}
                            size="small"
                            sx={{ mx: 0.5 }}
                          />
                        )}
                      </Typography>
                    </Paper>
                  )}
              </Stack>
            ) : (
              <Stack spacing={2.5}>
                {/* Action Type Selection */}
                <Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight={600}
                    sx={{
                      mb: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    Action Type
                    <Chip
                      label="Required"
                      size="small"
                      color="primary"
                      sx={{ height: 18, fontSize: "0.7rem" }}
                    />
                  </Typography>
                  <Dropdown
                    value={nodeConfig.actionType}
                    onChange={(e) =>
                      setNodeConfig({
                        ...nodeConfig,
                        actionType: e.value,
                      })
                    }
                    options={ACTION_TYPES}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select action type"
                    className="w-full"
                    itemTemplate={actionTypeOptionTemplate}
                    appendTo="self"
                    panelClassName="custom-dropdown-panel"
                    style={{
                      borderRadius: "0.75rem",
                      fontSize: "0.875rem",
                    }}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    {nodeConfig.actionType === "block"
                      ? "Prevent the action from being performed"
                      : "Modify data before processing"}
                  </Typography>
                </Box>

                {/* Transform-specific Fields */}
                <Collapse in={nodeConfig.actionType === "transform"}>
                  <Stack spacing={2.5}>
                    <Box>
                      <Typography
                        variant="subtitle2"
                        fontWeight={600}
                        sx={{
                          mb: 1,
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        Field to Update
                        <Chip
                          label="Required"
                          size="small"
                          color="primary"
                          sx={{ height: 18, fontSize: "0.7rem" }}
                        />
                      </Typography>
                      <Dropdown
                        value={nodeConfig.actionField}
                        onChange={(e) =>
                          setNodeConfig({
                            ...nodeConfig,
                            actionField: e.value,
                          })
                        }
                        options={ACTION_FIELD_CONFIGS[category] || []}
                        optionLabel="label"
                        optionValue="name"
                        placeholder="Select field to update"
                        className="w-full"
                        itemTemplate={fieldOptionTemplate}
                        appendTo="self"
                        panelClassName="custom-dropdown-panel"
                        style={{
                          borderRadius: "0.75rem",
                          fontSize: "0.875rem",
                        }}
                      />
                    </Box>

                    {/* Dynamic Value Input based on field type */}
                    {(() => {
                      const actionFields = ACTION_FIELD_CONFIGS[category] || [];
                      const field = actionFields.find(
                        (f) => f.name === nodeConfig.actionField,
                      );

                      if (!field) return null;

                      if (field.type === "select" && field.options) {
                        return (
                          <Box>
                            <Typography
                              variant="subtitle2"
                              fontWeight={600}
                              sx={{
                                mb: 1,
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                              }}
                            >
                              New Value
                              <Chip
                                label="Required"
                                size="small"
                                color="primary"
                                sx={{ height: 18, fontSize: "0.7rem" }}
                              />
                            </Typography>
                            <Dropdown
                              value={nodeConfig.actionValue}
                              onChange={(e) =>
                                setNodeConfig({
                                  ...nodeConfig,
                                  actionValue: e.value,
                                })
                              }
                              options={field.options}
                              placeholder="Select new value"
                              className="w-full"
                              appendTo="self"
                              panelClassName="custom-dropdown-panel"
                              style={{
                                borderRadius: "0.75rem",
                                fontSize: "0.875rem",
                              }}
                            />
                          </Box>
                        );
                      } else if (field.type === "boolean") {
                        return (
                          <Box>
                            <Typography
                              variant="subtitle2"
                              fontWeight={600}
                              sx={{
                                mb: 1,
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                              }}
                            >
                              New Value
                              <Chip
                                label="Required"
                                size="small"
                                color="primary"
                                sx={{ height: 18, fontSize: "0.7rem" }}
                              />
                            </Typography>
                            <Dropdown
                              value={nodeConfig.actionValue}
                              onChange={(e) =>
                                setNodeConfig({
                                  ...nodeConfig,
                                  actionValue: e.value,
                                })
                              }
                              options={[
                                { label: "True", value: true },
                                { label: "False", value: false },
                              ]}
                              optionLabel="label"
                              optionValue="value"
                              placeholder="Select boolean value"
                              className="w-full"
                              appendTo="self"
                              style={{
                                borderRadius: "0.75rem",
                                fontSize: "0.875rem",
                              }}
                            />
                          </Box>
                        );
                      } else if (field.type === "number") {
                        return (
                          <Box>
                            <Typography
                              variant="subtitle2"
                              fontWeight={600}
                              sx={{
                                mb: 1,
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                              }}
                            >
                              New Value
                              <Chip
                                label="Required"
                                size="small"
                                color="primary"
                                sx={{ height: 18, fontSize: "0.7rem" }}
                              />
                            </Typography>
                            <InputText
                              value={nodeConfig.actionValue}
                              onChange={(e) =>
                                setNodeConfig({
                                  ...nodeConfig,
                                  actionValue: e.target.value,
                                })
                              }
                              placeholder="Enter numeric value"
                              keyfilter="num"
                              className="w-full"
                              style={{
                                borderRadius: "0.75rem",
                                fontSize: "0.875rem",
                              }}
                            />
                          </Box>
                        );
                      } else {
                        return (
                          <Box>
                            <Typography
                              variant="subtitle2"
                              fontWeight={600}
                              sx={{
                                mb: 1,
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                              }}
                            >
                              New Value
                              <Chip
                                label="Required"
                                size="small"
                                color="primary"
                                sx={{ height: 18, fontSize: "0.7rem" }}
                              />
                            </Typography>
                            <InputText
                              value={nodeConfig.actionValue}
                              onChange={(e) =>
                                setNodeConfig({
                                  ...nodeConfig,
                                  actionValue: e.target.value,
                                })
                              }
                              placeholder="Enter new value"
                              className="w-full"
                              style={{
                                borderRadius: "0.75rem",
                                fontSize: "0.875rem",
                              }}
                            />
                          </Box>
                        );
                      }
                    })()}
                  </Stack>
                </Collapse>

                {/* Message Input */}
                <Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight={600}
                    sx={{
                      mb: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    Message
                    <Chip
                      label="Optional"
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: "0.7rem",
                        bgcolor: "rgba(128,128,128,0.2)",
                      }}
                    />
                  </Typography>
                  <InputTextarea
                    value={nodeConfig.message}
                    onChange={(e) =>
                      setNodeConfig({ ...nodeConfig, message: e.target.value })
                    }
                    placeholder="Enter a message to display when this action is triggered"
                    rows={3}
                    className="w-full"
                    style={{
                      borderRadius: "0.75rem",
                      fontSize: "0.875rem",
                    }}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    This message will be shown to users when the action executes
                  </Typography>
                </Box>

                {/* Preview Card */}
                {nodeConfig.actionType && (
                  <Paper
                    sx={{
                      p: 2,
                      bgcolor:
                        theme === "light"
                          ? "rgba(255, 152, 0, 0.05)"
                          : "rgba(255, 152, 0, 0.1)",
                      border: "1px solid",
                      borderColor:
                        theme === "light"
                          ? "rgba(255, 152, 0, 0.2)"
                          : "rgba(255, 152, 0, 0.3)",
                      borderRadius: 2,
                    }}
                  >
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      color="text.secondary"
                      sx={{ mb: 0.5, display: "block" }}
                    >
                      ACTION PREVIEW
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      <Chip
                        label={nodeConfig.actionType.toUpperCase()}
                        size="small"
                        sx={{
                          mr: 1,
                          bgcolor: theme === "light" ? "#ff9800" : "#f57c00",
                          color: "#fff",
                        }}
                      />
                      {nodeConfig.actionType === "transform" &&
                        nodeConfig.actionField && (
                          <>
                            Set{" "}
                            <Chip
                              label={nodeConfig.actionField}
                              size="small"
                              sx={{ mx: 0.5 }}
                            />{" "}
                            to{" "}
                            <Chip
                              label={nodeConfig.actionValue || "..."}
                              size="small"
                              sx={{ mx: 0.5 }}
                            />
                          </>
                        )}
                      {nodeConfig.actionType === "block" &&
                        "Prevent this action"}
                    </Typography>
                  </Paper>
                )}
              </Stack>
            )}
          </Box>

          {/* Footer */}
          <Box
            sx={{
              display: "flex",
              gap: 1,
              justifyContent: "flex-end",
              p: 2.5,
              borderTop: "1px solid",
              borderColor:
                theme === "light"
                  ? "rgba(0,0,0,0.08)"
                  : "rgba(255,255,255,0.08)",
            }}
          >
            <Button
              variant="ghost"
              size="small"
              onClick={() => setShowNodeEditor(false)}
            >
              Cancel
            </Button>
            <Button size="small" onClick={handleNodeUpdate}>
              Update Node
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default VisualRuleBuilder;
