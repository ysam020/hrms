import Modules from "../components/home/Modules.js";
import Profile from "../components/profile/Profile.js";
import Help from "../components/home/Help.js";
import Dashboard from "../components/dashboard/Dashboard.js";
import Calendar from "../components/home/Calendar.js";
import Analytics from "../components/analytics/Analytics.js";
import Permissions from "../components/home/permissions/Permissions.js";
// Employee KYC
import EmployeeKYC from "../components/hrManagement/employeeKyc/EmployeeKYC.js";
import ViewIndividualKyc from "../components/hrManagement/employeeKyc/ViewIndividualKyc.js";
import EditEmployeeKyc from "../components/hrManagement/employeeKyc/EditEmployeeKyc.js";
// Employee Management
import EmployeeManagement from "../components/hrManagement/employeeManagement/EmployeeManagement.js";
import EditDetails from "../components/hrManagement/employeeManagement/EditDetails.js";
import ViewDetails from "../components/hrManagement/employeeManagement/ViewDetails.js";
// Salary Management
import EmployeeList from "../components/hrManagement/salaryManagement/EmployeeList.js";
import EditSalaryStructure from "../components/hrManagement/salaryManagement/EditSalaryStructure.js";
// Holidays
import Holidays from "../components/hrManagement/holidays/Holidays.js";
// Job Openings
import JobOpenings from "../components/hrManagement/job-openings/JobOpenings.js";
import ViewIndividualJob from "../components/hrManagement/job-openings/ViewIndividualJob.js";
// Appraisal
import Appraisal from "../components/hrManagement/appraisal/Appraisal.js";
// Training and Development
import TrainingAndDevelopment from "../components/hrManagement/training/TrainingAndDevelopment.js";
// Announcements
import HrActivities from "../components/hrManagement/hrActivities/HrActivities.js";
// Attendance
import Attendance from "../components/hrManagement/attendance/Attendance.js";
// Resignation
import Resignation from "../components/hrManagement/resignation/Resignation.js";

const routesConfig = () => {
  return [
    {
      path: "/profile",
      element: <Profile />,
      allowedModules: [],
      name: "Profile",
      category: null,
    },
    {
      path: "/",
      element: <Dashboard />,
      allowedModules: [],
      name: "Dashboard",
      category: null,
    },
    {
      path: "/calendar",
      element: <Calendar />,
      allowedModules: [],
      name: "Calendar",
      category: null,
    },
    {
      path: "/modules",
      element: <Modules />,
      allowedModules: [],
      name: "Modules",
      category: null,
    },
    {
      path: "/analytics",
      element: <Analytics />,
      allowedModules: [],
      name: "Analytics",
      category: null,
    },
    {
      path: "/permissions",
      element: <Permissions />,
      allowedModules: [],
      name: "Permissions",
      category: null,
    },
    {
      path: "/help",
      element: <Help />,
      allowedModules: [],
      name: "Help",
      category: null,
    },
    {
      path: "/hr-activities",
      element: <HrActivities />,
      allowedModules: ["HR Activities"],
      name: "HR Activities",
      category: "HR & Management",
    },
    {
      path: "/kyc",
      element: <EmployeeKYC />,
      allowedModules: ["Basic KYC Details"],
      name: "Basic KYC Details",
      category: "HR & Management",
    },
    {
      path: "/view-kyc/:username",
      element: <ViewIndividualKyc />,
      allowedModules: ["Basic KYC Details"],
      name: "View KYC Details",
      category: "HR & Management",
    },
    {
      path: "/edit-kyc/:username",
      element: <EditEmployeeKyc />,
      allowedModules: ["Basic KYC Details"],
      name: "Edit KYC Details",
      category: "HR & Management",
    },
    {
      path: "/employee-management",
      element: <EmployeeManagement />,
      allowedModules: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
    },
    {
      path: "/salary-management",
      element: <EmployeeList />,
      allowedModules: ["Salary Management"],
      name: "Salary Management",
      category: "HR & Management",
    },
    {
      path: "/salary-management/edit/:username",
      element: <EditSalaryStructure />,
      allowedModules: ["Salary Management"],
      name: "Salary Management",
      category: "HR & Management",
    },
    {
      path: "/salary-management/view/:username",
      element: <EmployeeList />,
      allowedModules: ["Salary Management"],
      name: "Salary Management",
      category: "HR & Management",
    },
    {
      path: "/holidays",
      element: <Holidays />,
      allowedModules: ["Holidays"],
      name: "Holidays",
      category: "HR & Management",
    },
    {
      path: "/employee-management/view/:username",
      element: <ViewDetails />,
      allowedModules: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
    },
    {
      path: "/employee-management/edit/:username",
      element: <EditDetails />,
      allowedModules: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
    },
    {
      path: "/job-openings",
      element: <JobOpenings />,
      allowedModules: ["Job Openings"],
      name: "Job Openings",
      category: "HR & Management",
    },
    {
      path: "/view-job-opening/:_id",
      element: <ViewIndividualJob />,
      allowedModules: ["Job Openings"],
      name: "View Job",
      category: "HR & Management",
    },
    {
      path: "/performance-appraisal",
      element: <Appraisal />,
      allowedModules: ["Performance Appraisal"],
      name: "Performance Appraisal",
      category: "HR & Management",
    },
    {
      path: "/training",
      element: <TrainingAndDevelopment />,
      allowedModules: ["Training And Development"],
      name: "Training And Development",
      category: "HR & Management",
    },
    {
      path: "/attendance",
      element: <Attendance />,
      allowedModules: ["Attendance & Leaves"],
      name: "Attendance & Leaves",
      category: "HR & Management",
    },
    {
      path: "/resignation-process",
      element: <Resignation />,
      allowedModules: ["Resignation Process"],
      name: "Resignation Process",
      category: "HR & Management",
    },
  ];
};

export default routesConfig;
