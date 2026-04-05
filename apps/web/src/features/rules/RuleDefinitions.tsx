// Rule Definitions - Predefined business rules for attendance and leave

const RULE_TEMPLATES = {
  attendance: [
    {
      id: "att_working_hours_present",
      name: "Working Hours - Present",
      description: "Mark attendance as Present if working hours >= 7",
      category: "attendance",
      template: true,
      conditions: [
        {
          field: "workingHours",
          operator: "greater_or_equal",
          value: 7,
          valueType: "number",
        },
      ],
      conditionLogic: "AND",
      actions: [
        {
          type: "transform",
          field: "status",
          value: "Present",
          message: "Attendance marked as Present (worked 7+ hours)",
        },
      ],
      priority: 10,
      status: "draft",
      tags: ["attendance", "working-hours", "present"],
    },
    {
      id: "att_working_hours_half_day",
      name: "Working Hours - Half Day",
      description: "Mark attendance as Half Day if working hours between 5-7",
      category: "attendance",
      template: true,
      conditions: [
        {
          field: "workingHours",
          operator: "greater_or_equal",
          value: 5,
          valueType: "number",
        },
        {
          field: "workingHours",
          operator: "less_than",
          value: 7,
          valueType: "number",
        },
      ],
      conditionLogic: "AND",
      actions: [
        {
          type: "transform",
          field: "status",
          value: "Half Day",
          message: "Attendance marked as Half Day (worked 5-7 hours)",
        },
      ],
      priority: 9,
      status: "draft",
      tags: ["attendance", "working-hours", "half-day"],
    },
    {
      id: "att_working_hours_leave",
      name: "Working Hours - Leave",
      description: "Mark attendance as Leave if working hours < 5",
      category: "attendance",
      template: true,
      conditions: [
        {
          field: "workingHours",
          operator: "less_than",
          value: 5,
          valueType: "number",
        },
      ],
      conditionLogic: "AND",
      actions: [
        {
          type: "transform",
          field: "status",
          value: "Leave",
          message: "Attendance marked as Leave (worked less than 5 hours)",
        },
      ],
      priority: 8,
      status: "draft",
      tags: ["attendance", "working-hours", "leave"],
    },
    {
      id: "att_max_corrections",
      name: "Maximum Attendance Corrections",
      description:
        "Block attendance correction if monthly limit (3) is exceeded",
      category: "attendance",
      template: true,
      conditions: [
        {
          field: "correctionsUsed",
          operator: "greater_or_equal",
          value: 3,
          valueType: "number",
        },
      ],
      conditionLogic: "AND",
      actions: [
        {
          type: "block",
          message:
            "Maximum attendance corrections (3) for this month has been reached. Cannot make more corrections.",
        },
      ],
      priority: 15,
      status: "draft",
      tags: ["attendance", "corrections", "limit"],
    },
  ],
  leave: [
    {
      id: "leave_sick_medical_certificate",
      name: "Sick Leave - Medical Certificate Required",
      description:
        "Block sick leave application if medical certificate is not provided",
      category: "leave",
      template: true,
      conditions: [
        {
          field: "sick_leave",
          operator: "equals",
          value: true,
          valueType: "boolean",
        },
        {
          field: "medical_certificate",
          operator: "equals",
          value: "",
          valueType: "string",
        },
      ],
      conditionLogic: "AND",
      actions: [
        {
          type: "block",
          message:
            "Medical certificate is required for sick leave. Please upload the certificate before submitting.",
        },
      ],
      priority: 20,
      status: "draft",
      tags: ["leave", "sick-leave", "medical-certificate"],
    },
    {
      id: "leave_carry_forward",
      name: "Leave Carry Forward Limit",
      description:
        "Limit carry forward leaves to 10 days for next financial year",
      category: "leave",
      template: true,
      conditions: [
        {
          field: "carryForwardDays",
          operator: "greater_than",
          value: 10,
          valueType: "number",
        },
      ],
      conditionLogic: "AND",
      actions: [
        {
          type: "transform",
          field: "carryForwardDays",
          value: 10,
          message:
            "Carry forward leaves limited to maximum 10 days as per policy",
        },
      ],
      priority: 12,
      status: "draft",
      tags: ["leave", "carry-forward", "limit"],
    },
  ],
};

// Get templates by category
export const getTemplatesByCategory = (category) => {
  return RULE_TEMPLATES[category] || [];
};

// Rule metadata
export const RULE_METADATA = {
  attendance: {
    totalTemplates: 4,
    description: "Rules for attendance marking and corrections",
    icon: "📅",
    color: "#2196f3",
  },
  leave: {
    totalTemplates: 2,
    description: "Rules for leave applications and carry forward",
    icon: "🏖️",
    color: "#4caf50",
  },
};

export const createRuleFromTemplate = (template) => {
  const { id, template: isTemplate, ...ruleData } = template;
  return {
    ...ruleData,
    templateId: id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "system",
    status: "draft",
  };
};
