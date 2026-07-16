export type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  department: string;
  designation: string;
  employeeStatus: string;
  employee_photo: string;
  children?: Employee[];
};

export type OrgChartPerson = {
  id: string;
  name: string;
  username: string;
  designation: string | null;
  employeePhoto: string | null;
};

export type OrgChartTeam = {
  _id: string;
  teamName: string;
  leader: OrgChartPerson;
  members: OrgChartPerson[];
};

export type OrgChartResponse = {
  ceo: (OrgChartPerson & { designation: string; department: string }) | null;
  teams: OrgChartTeam[];
  // Active employees not yet on any team — e.g. a join request approved
  // today but never assigned a department. Surfaced explicitly instead of
  // silently dropped, so headcount matches the real active employee count.
  unassigned: OrgChartPerson[];
  // Every employee record regardless of status (active/resigned/
  // terminated/absconded) — used only for the "Total Employees" stat card,
  // the tree itself only ever shows active headcount.
  totalEmployeeCount: number;
  // Per-status counts backing the "Total Employees" breakdown.
  employeeStatusBreakdown: {
    active: number;
    resigned: number;
    terminated: number;
    absconded: number;
  };
};

export type RoleConfig = {
  color: string;
  icon: string;
  bgColor: string;
  borderColor: string;
};
