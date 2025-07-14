export const permissionStructure = {
  TrainingAndDevelopment: {
    actions: {
      view: ["self", "team", "all"],
      assign_to_employee: ["team", "all"],
      mark_complete_for_employee: ["team", "all"],
    },
  },
  HRActivities: {
    actions: {
      view: ["all"],
      create: ["-"],
      edit: ["-"],
      delete: ["-"],
    },
  },
  Attendance: {
    actions: {
      view: ["self", "team", "all"],
      mark_attendance: ["self"],
      attendance_correction: ["all"],
    },
  },
  Leave: {
    actions: {
      view: ["self", "team", "all"],
      apply: ["self"],
      approve: ["team", "all"],
      reject: ["team", "all"],
    },
  },
  EmployeeManagement: {
    actions: {
      view: ["-"],
      edit: ["-"],
    },
  },
  BasicKYCDetails: {
    actions: {
      fill_kyc_form: ["self"],
      view_kyc: ["self", "all"],
      edit_kyc: ["all"],
      approve_kyc: ["all"],
      reject_kyc: ["all"],
    },
  },
  JobOpenings: {
    actions: {
      view_job_openings: ["-"],
      create_job_opening: ["-"],
      view_applications: ["-"],
      edit_job_opening: ["-"],
      delete_job_opening: ["-"],
      schedule_interview: ["-"],
      take_interview: ["-"],
      provide_feedback: ["-"],
      reassign_interviewer: ["-"],
      update_candidate_status: ["-"],
      hire_candidate: ["-"],
      reject_candidate: ["-"],
    },
  },
  PerformanceAppraisal: {
    actions: {
      view: ["self", "team", "all"],
      apply: ["self"],
      delete: ["self"],
      provide_feedback: ["team", "all"],
    },
  },
  ResignationProcess: {
    actions: {
      resign: ["self"],
      withdraw_resignation: ["self"],
      add_exit_feedback: ["self"],
      view_resignation: ["self", "team", "all"],
      approve_resignation: ["team", "all"],
      reject_resignation: ["team", "all"],
      update_resignation_status: ["team", "all"],
    },
  },
  Permissions: {
    actions: {
      create_role: ["-"],
      view_role_permissions: ["-"],
      view_role_and_permissions: ["-"],
      view_user_permissions: ["-"],
      manage_role_permissions: ["-"],
      delete_role: ["-"],
      assign_user_permissions: ["-"],
      remove_user_role: ["-"],
      create_team: ["-"],
      view_teams: ["-"],
      add_team_member: ["-"],
      delete_team_member: ["-"],
      delete_team: ["-"],
      assign_superuser: ["-"],
      revoke_superuser: ["-"],
    },
  },
  AuditLogs: {
    actions: {
      view: ["self", "team", "all"],
    },
  },
  Holidays: {
    actions: {
      add: ["-"],
      delete: ["-"],
    },
  },
  SalaryManagement: {
    actions: {
      update_salary: ["-"],
      view_salaries: ["-"],
      view_salary_slips: ["-"],
    },
  },
};
