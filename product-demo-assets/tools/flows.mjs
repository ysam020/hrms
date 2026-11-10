// The product-demo videos: what each one shows, scripted against the real
// app (see harness.mjs: the API is answered by fictional Halcyon Labs
// fixtures, so nothing real is read or changed).
//
// rec.chapter(title) marks a chapter; rec.say(en, hi) starts a subtitle cue
// and its narration (narrate.mjs). Both wait until the previous line has been
// spoken in both languages, so the video is paced to its narration. Hindi keeps product terms (Attendance, Geofencing, Payroll…) in
// English, as Praesto's UI shows them.
const side = (p, name) =>
  p.getByRole("navigation").getByRole("link", { name, exact: true });
/** The date picker's day cell for `d` (cells are named "Thursday, 19 November 2026"). */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function dayCell(p, d) {
  return p.getByRole("dialog").getByRole("gridcell", {
    name: new RegExp(
      `, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}$`,
    ),
  });
}
/** The first weekday at least `n` days from today (or before, if n < 0). */
function weekday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const step = n < 0 ? -1 : 1;
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + step);
  return d;
}
/** Pick a date in the picker behind `button`, moving months if needed. */
async function pickDate(r, button, d) {
  const p = r.page;
  await r.click(button);
  await r.wait(600);
  for (let i = 0; i < 2 && !(await dayCell(p, d).count()); i++) {
    await r.click(
      p
        .getByRole("dialog")
        .getByRole("button", {
          name: d < new Date() ? "Previous month" : "Next month",
        }),
    );
    await r.wait(400);
  }
  await r.click(dayCell(p, d));
  await r.wait(700);
}

/** Open a sidebar group (if collapsed) and follow one of its links. */
async function nav(r, group, item) {
  const p = r.page;
  const link = side(p, item);
  if (!(await link.isVisible().catch(() => false))) {
    await r.click(
      p
        .getByRole("navigation")
        .getByRole("button", { name: group, exact: true }),
    );
    await r.wait(500);
  }
  await r.click(link);
  await r.wait(1100);
}

export const FLOWS = {
  // ── Platform overview ────────────────────────────────────────────────────
  "today-at-a-glance": {
    module: "overview",
    title: "Your Day at a Glance",
    description:
      "The Today screen: hours worked, the month’s attendance and the requests waiting on you, in one place.",
    path: "/dashboard",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Today is the first screen everyone sees when they open Praesto.",
        "Today वह पहली स्क्रीन है जो Praesto खोलते ही सबको दिखती है।",
      );
      await r.wait(3600);
      await r.chapter("Your Day");
      await r.say(
        "Your Day shows how long you've worked since you punched in.",
        "Your Day में दिखता है कि punch in के बाद आपने कितनी देर काम किया।",
      );
      await r.point(p.getByRole("button", { name: /Punch Out/ }));
      await r.wait(3200);
      await r.say(
        "Each block is one day of the month, coloured by its attendance.",
        "हर block महीने का एक दिन है, और उसका रंग उस दिन की attendance बताता है।",
      );
      await r.glide(560, 610, 900);
      await r.wait(1200);
      await r.glide(1000, 690, 1100);
      await r.wait(1600);
      await r.chapter("Needs Your Decision");
      await r.say(
        "Below it, every request waiting for your decision.",
        "उसके नीचे वे सभी requests हैं जिन पर आपका फ़ैसला बाकी है।",
      );
      await r.scroll(200, 1100);
      await r.wait(1600);
      await r.say(
        "Leave, work from home and salary advances can be approved right here.",
        "Leave, work from home और salary advance को यहीं से approve किया जा सकता है।",
      );
      await r.point(p.getByRole("button", { name: /^Approve/ }));
      await r.wait(3200);
      await r.chapter("Approvals");
      await r.say(
        "All Approvals collects every pending request in one list.",
        "All Approvals में सभी pending requests एक ही list में मिलती हैं।",
      );
      await r.click(p.getByRole("link", { name: "All Approvals" }));
      await r.wait(3600);
    },
  },

  "organization-structure": {
    module: "overview",
    title: "Your Organisation, Mapped",
    description:
      "Browse teams, team leads and the people in each, and find anyone in the organisation.",
    path: "/organization-tree",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Organisation shows how your company is structured.",
        "Organisation में दिखता है कि आपकी कंपनी की संरचना कैसी है।",
      );
      await r.wait(3400);
      await r.chapter("Headcount");
      await r.say(
        "At the top: total people, how many are active, teams, and anyone unassigned.",
        "ऊपर: कुल लोग, कितने active हैं, teams, और जिन्हें कोई team नहीं मिली।",
      );
      await r.glide(330, 160, 800);
      await r.wait(900);
      await r.glide(1080, 160, 1200);
      await r.wait(1800);
      await r.chapter("Teams");
      await r.say(
        "Every team has a lead. Open a team to see its members.",
        "हर team का एक lead होता है। Team खोलकर उसके members देखें।",
      );
      await r.click(p.getByRole("button", { name: /Show 3 members/ }));
      await r.wait(3600);
      await r.chapter("Find a Person");
      await r.say(
        "Search finds a person or a team instantly.",
        "Search से कोई भी व्यक्ति या team तुरंत मिल जाती है।",
      );
      await r.type(p.getByPlaceholder("Find a person or team"), "Design", 90);
      await r.wait(3400);
    },
  },

  // ── Employee management ──────────────────────────────────────────────────
  "employee-directory": {
    module: "employee-management",
    title: "Employee Directory and Profiles",
    description:
      "Search the directory, then open an employee’s profile: work details, contact, statutory IDs and assigned assets.",
    path: "/employee-management/employee-list",
    async run(r) {
      const p = r.page;
      await r.chapter("Directory");
      await r.say(
        "The directory lists everyone with their role, department and joining date.",
        "Directory में सभी लोग अपने role, department और joining date के साथ दिखते हैं।",
      );
      await r.glide(900, 300, 900);
      await r.wait(2800);
      await r.say(
        "KYC status shows whose documents are approved or still pending.",
        "KYC status बताता है कि किसके documents approved हैं और किसके pending।",
      );
      await r.glide(1330, 330, 900);
      await r.wait(2600);
      await r.chapter("Search");
      await r.say(
        "Search by name, email or username.",
        "नाम, email या username से search करें।",
      );
      await r.type(
        p.getByPlaceholder("Search by name, email, or username"),
        "Priya",
        110,
      );
      await r.wait(2200);
      await r.chapter("Employee Profile");
      await r.say(
        "Open a profile for work details, contact information and reporting.",
        "Profile खोलकर work details, contact जानकारी और reporting देखें।",
      );
      await r.click(p.getByRole("main").getByText("Priya Nair").first());
      await r.wait(3400);
      await r.say(
        "Statutory details for payroll, and the assets issued to them, are here too.",
        "Payroll के लिए statutory details और उन्हें दिए गए assets भी यहीं हैं।",
      );
      await r.scroll(300, 1100);
      await r.wait(3600);
    },
  },

  "join-requests": {
    module: "employee-management",
    title: "Adding People to Your Organisation",
    description:
      "New employees sign in and ask to join; an admin approves or declines each request.",
    path: "/settings/join-requests",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "New employees sign in to Praesto and ask to join your organisation.",
        "नए employees Praesto में sign in करके आपके organisation से जुड़ने का अनुरोध करते हैं।",
      );
      await r.wait(3800);
      await r.chapter("Review Requests");
      await r.say(
        "Each request shows who asked and when.",
        "हर request में दिखता है कि किसने और कब अनुरोध किया।",
      );
      await r.glide(560, 250, 900);
      await r.wait(2600);
      await r.chapter("Approve");
      await r.say(
        "Approve to let them in, or reject to decline the request.",
        "उन्हें जोड़ने के लिए Approve करें, या मना करने के लिए Reject।",
      );
      await r.point(p.getByRole("button", { name: "Reject" }).first());
      await r.wait(1200);
      await r.click(p.getByRole("button", { name: "Approve" }).first());
      await r.wait(1400);
      const confirm = p
        .getByRole("dialog")
        .getByRole("button", { name: /Approve/ });
      if (await confirm.count()) {
        await r.say(
          "Confirm, and they become an employee of the organisation.",
          "Confirm करें, और वे organisation के employee बन जाते हैं।",
        );
        await r.wait(1600);
        await r.click(confirm);
      }
      await r.wait(3200);
    },
  },

  // ── Attendance ───────────────────────────────────────────────────────────
  "my-attendance": {
    module: "attendance",
    title: "Attendance at a Glance",
    description:
      "An employee’s month: present days, leave, corrections left, and a daily record of punches and hours.",
    path: "/attendance",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "My Attendance shows your month: punches, hours and time away.",
        "My Attendance में आपका पूरा महीना दिखता है: punches, घंटे और छुट्टियाँ।",
      );
      await r.wait(3600);
      await r.chapter("Monthly Summary");
      await r.say(
        "Present days, half days, paid leave and loss of pay, at a glance.",
        "Present days, half days, paid leave और loss of pay, एक नज़र में।",
      );
      await r.glide(420, 230, 800);
      await r.wait(800);
      await r.glide(1150, 230, 1300);
      await r.wait(1600);
      await r.say(
        "Corrections Left shows how many fixes you can still request this month.",
        "Corrections Left बताता है कि इस महीने आप और कितने सुधार माँग सकते हैं।",
      );
      await r.glide(1330, 230, 700);
      await r.wait(3000);
      await r.chapter("Calendar");
      await r.say(
        "The calendar colours each day: present, late, on leave or a week off.",
        "Calendar हर दिन को रंग देता है: present, late, leave या week off।",
      );
      await r.glide(560, 430, 900);
      await r.wait(3400);
      await r.chapter("Daily Record");
      await r.say(
        "The daily record lists punch-in and punch-out times and hours worked.",
        "Daily record में punch-in, punch-out का समय और काम के घंटे दर्ज होते हैं।",
      );
      await r.scroll(380, 1200);
      await r.wait(3600);
      await r.chapter("Previous Months");
      await r.say(
        "Step back to any earlier month.",
        "किसी भी पिछले महीने पर जाएँ।",
      );
      await r.scroll(-380, 900);
      await r.click(p.getByRole("button", { name: "Previous month" }));
      await r.wait(3000);
    },
  },

  "attendance-correction": {
    module: "attendance",
    title: "Correcting Attendance",
    description:
      "HR fixes a missed or wrong punch for an employee; the correction counts toward their monthly allowance.",
    path: "/attendance/attendance-correction",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Forgot to punch out? HR can correct the record.",
        "Punch out करना भूल गए? HR record को सुधार सकता है।",
      );
      await r.wait(3200);
      await r.chapter("Choose the Employee");
      await r.say(
        "Find the employee whose attendance needs fixing.",
        "उस employee को चुनें जिसकी attendance ठीक करनी है।",
      );
      await r.type(p.getByRole("combobox", { name: "Employee" }), "Rohan", 120);
      await r.wait(1200);
      await r.click(p.getByRole("option", { name: /Rohan Gupta/ }));
      await r.wait(1400);
      await r.chapter("Rules");
      await r.say(
        "Each correction counts toward the employee's monthly allowance.",
        "हर correction employee की monthly limit में गिना जाता है।",
      );
      await r.glide(1180, 280, 900);
      await r.wait(3600);
      await r.chapter("Corrected Times");
      await r.say(
        "Pick the day, then the times they actually started and finished.",
        "दिन चुनें, फिर वह समय जब उन्होंने वास्तव में काम शुरू और खत्म किया।",
      );
      await pickDate(
        r,
        p.getByRole("button", { name: "Date and Time", exact: true }),
        weekday(-3),
      );
      await r.point(p.getByRole("button", { name: "Time" }).first());
      await r.wait(2000);
      await r.say(
        "The summary previews the change before it's saved.",
        "Save करने से पहले summary में बदलाव दिख जाता है।",
      );
      await r.point(p.getByRole("button", { name: "Save Correction" }));
      await r.wait(3200);
    },
  },

  geofencing: {
    module: "attendance",
    title: "Attendance Rules and Geofencing",
    description:
      "Set the working day, grace period and correction window, then turn on Geofencing and place the office on a map.",
    path: "/settings/attendance",
    async run(r) {
      const p = r.page;
      await r.chapter("Working Day");
      await r.say(
        "Attendance Rules apply to everyone in the organisation.",
        "Attendance Rules organisation के सभी लोगों पर लागू होते हैं।",
      );
      await r.wait(3200);
      await r.say(
        "Set when the workday starts, the grace period, and full and half day hours.",
        "Workday कब शुरू होता है, grace period, और full व half day के घंटे तय करें।",
      );
      await r.glide(1100, 260, 900);
      await r.wait(1000);
      await r.glide(1100, 420, 1000);
      await r.wait(2000);
      await r.chapter("Geofencing");
      await r.say(
        "With Geofencing, employees can punch in only near the office.",
        "Geofencing से employees सिर्फ़ office के पास से ही punch in कर सकते हैं।",
      );
      const geo = p.getByRole("switch", { name: "Geofencing" });
      await r.scroll(420, 1000);
      await r.wait(800);
      if (!(await geo.isChecked())) await r.click(geo);
      await r.wait(1400);
      await r.scroll(360, 1000);
      await r.chapter("Office Location");
      await r.say(
        "Search for the office, or drop a pin on the map.",
        "Office का पता search करें, या map पर pin लगाएँ।",
      );
      await r.type(
        p.getByPlaceholder("Search a place, or paste a Google Maps link"),
        "MG Road, Bengaluru",
        80,
      );
      await r.wait(2200);
      const hit = p.getByRole("option").first();
      if (await hit.count()) {
        await r.click(hit);
        await r.wait(2600);
      }
      await r.chapter("Radius");
      await r.say(
        "The radius sets how far from the office a punch is allowed.",
        "Radius तय करता है कि office से कितनी दूरी तक punch की अनुमति है।",
      );
      await r.point(p.getByLabel("Radius"));
      await r.wait(3200);
      await r.say(
        "Nothing changes until you save.",
        "Save करने तक कुछ नहीं बदलता।",
      );
      await r.wait(2600);
    },
    tail: 1500,
  },

  // ── Leave management ─────────────────────────────────────────────────────
  "apply-leave": {
    module: "leave-management",
    title: "Applying for Leave",
    description:
      "Choose the dates and leave type, check the balance, and send the request to your approver.",
    path: "/attendance/apply-leave",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Applying for leave takes a few seconds.",
        "Leave के लिए apply करने में बस कुछ seconds लगते हैं।",
      );
      await r.wait(3000);
      await r.chapter("Choose Dates");
      await r.say(
        "Choose a full day, a half day or a few hours, then pick the dates.",
        "Full day, half day या कुछ घंटे चुनें, फिर तारीख़ें चुनें।",
      );
      await r.point(p.getByRole("radio", { name: /Full Days/ }));
      await r.wait(1000);
      const from = weekday(9);
      const to = new Date(from);
      to.setDate(from.getDate() + (from.getDay() === 5 ? 3 : 1));
      await pickDate(r, p.getByRole("button", { name: "From" }), from);
      await pickDate(r, p.getByRole("button", { name: "To" }), to);
      await r.wait(800);
      await r.chapter("Details");
      await r.say(
        "Pick the leave type and add a short note for your approver.",
        "Leave type चुनें और approver के लिए एक छोटा सा note लिखें।",
      );
      await r.point(p.getByRole("button", { name: "Leave Type" }));
      await r.wait(700);
      await r.type(
        p.getByRole("textbox", { name: "Reason" }),
        "Family function in Kochi",
        60,
      );
      await r.wait(1200);
      await r.chapter("Review");
      await r.say(
        "Your Request sums up the type, dates and duration before you send it.",
        "भेजने से पहले Your Request में type, तारीख़ें और अवधि दिख जाती है।",
      );
      await r.glide(1260, 330, 900);
      await r.wait(3200);
      await r.chapter("Submit");
      await r.say(
        "Submit, and it goes straight to your approver.",
        "Submit करें, और request सीधे आपके approver के पास पहुँच जाती है।",
      );
      await r.click(p.getByRole("button", { name: "Submit Request" }));
      await r.wait(3200);
    },
  },

  "approve-leave": {
    module: "leave-management",
    title: "Manager Approval",
    description:
      "Review pending leave applications, filter by status, and approve with one click.",
    path: "/attendance/view-leave-applications",
    async run(r) {
      const p = r.page;
      await r.chapter("Leave Applications");
      await r.say(
        "Leave Applications shows every request from your team.",
        "Leave Applications में आपकी team की हर request दिखती है।",
      );
      await r.wait(3400);
      await r.chapter("Filter");
      await r.say(
        "Filter by status to see what's pending, approved or rejected.",
        "Status से filter करें: pending, approved या rejected।",
      );
      await r.click(p.getByRole("radio", { name: "Pending" }));
      await r.wait(2600);
      await r.chapter("Review a Request");
      await r.say(
        "Each request shows the dates, the reason and its status.",
        "हर request में तारीख़ें, कारण और status दिखते हैं।",
      );
      await r.glide(860, 250, 1000);
      await r.wait(3000);
      await r.chapter("Approve");
      await r.say(
        "Approve it, and the employee and their calendar are updated.",
        "Approve करें, और employee व उनका calendar अपडेट हो जाता है।",
      );
      await r.click(p.getByRole("button", { name: "Approve" }).first());
      await r.wait(1300);
      const confirm = p
        .getByRole("dialog")
        .getByRole("button", { name: /Approve/ });
      if (await confirm.count()) await r.click(confirm);
      await r.wait(3400);
    },
  },

  "leave-policy": {
    module: "leave-management",
    title: "Leave Policy",
    description:
      "Set yearly paid, sick and casual leave, require a medical certificate, and add custom leave types.",
    path: "/settings/leave",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Leave Policy sets the rules for everyone in the organisation.",
        "Leave Policy organisation के सभी लोगों के लिए नियम तय करती है।",
      );
      await r.wait(3400);
      await r.chapter("Statutory Entitlement");
      await r.say(
        "Set how many paid, sick and casual leave days each person gets a year.",
        "हर व्यक्ति को साल में कितने paid, sick और casual leave मिलें, यह तय करें।",
      );
      await r.point(p.getByLabel("Paid leave days"));
      await r.wait(1000);
      await r.point(p.getByLabel("Casual leave days"));
      await r.wait(2200);
      await r.say(
        "Optionally, require a medical certificate for sick leave.",
        "चाहें तो sick leave के लिए medical certificate ज़रूरी कर दें।",
      );
      await r.click(
        p.getByRole("switch", { name: "Require medical certificate" }),
      );
      await r.wait(3000);
      await r.chapter("Leave Types");
      await r.say(
        "Add your own leave types, with accrual, carry forward and encashment.",
        "अपने leave types जोड़ें, accrual, carry forward और encashment के साथ।",
      );
      await r.point(p.getByRole("button", { name: "Add Leave Type" }));
      await r.wait(3400);
    },
  },

  // ── Payroll ──────────────────────────────────────────────────────────────
  "payroll-runs": {
    module: "payroll",
    title: "Payroll Runs",
    description:
      "Each month’s payroll moves from draft to review, approval and disbursal, with totals at every step.",
    path: "/payroll/payroll-runs",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Payroll Runs: each run calculates a month's salaries.",
        "Payroll Runs: हर run एक महीने की salaries की गणना करता है।",
      );
      await r.wait(3400);
      await r.chapter("Latest Run");
      await r.say(
        "The latest run shows employees paid, total gross and total net.",
        "Latest run में दिखता है कितने employees, total gross और total net।",
      );
      await r.glide(800, 300, 900);
      await r.wait(3200);
      await r.chapter("Approval Steps");
      await r.say(
        "Every run is reviewed and approved before anyone is paid.",
        "किसी को भुगतान होने से पहले हर run review और approve होता है।",
      );
      await r.glide(560, 220, 900);
      await r.wait(3000);
      await r.chapter("Run History");
      await r.say(
        "The history lists every run with its status.",
        "History में हर run अपने status के साथ दिखता है।",
      );
      await r.scroll(220, 900);
      await r.click(p.getByRole("radio", { name: "Disbursed" }));
      await r.wait(2200);
      await r.click(p.getByRole("radio", { name: "All" }));
      await r.wait(1600);
      await r.say(
        "A draft run can be submitted for approval when it's ready.",
        "Draft run तैयार होने पर approval के लिए भेजा जा सकता है।",
      );
      await r.point(p.getByRole("button", { name: "Submit for Approval" }));
      await r.wait(3200);
    },
  },

  payslips: {
    module: "payroll",
    title: "Payslips",
    description:
      "Employees see their latest payslip, the breakdown of deductions, and download any month’s payslip or TDS worksheet.",
    path: "/payroll/my-payslips",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "My Payslips: salary statements and TDS worksheets, newest first.",
        "My Payslips: salary statements और TDS worksheets, सबसे नए पहले।",
      );
      await r.wait(3400);
      await r.chapter("Latest Payslip");
      await r.say(
        "The latest payslip shows take-home pay after deductions.",
        "Latest payslip में deductions के बाद की take-home salary दिखती है।",
      );
      await r.glide(420, 260, 900);
      await r.wait(3000);
      await r.say(
        "Gross pay, deductions and net pay are broken down below.",
        "नीचे gross pay, deductions और net pay का पूरा ब्यौरा है।",
      );
      await r.glide(780, 390, 1000);
      await r.wait(3000);
      await r.chapter("History");
      await r.say(
        "Every earlier month is here too, ready to download as a PDF.",
        "पिछले सभी महीने भी यहाँ हैं, PDF में download के लिए तैयार।",
      );
      await r.scroll(200, 900);
      await r.point(
        p.getByRole("button", { name: "Download payslip for August 2026" }),
      );
      await r.wait(3400);
    },
  },

  // ── Recruitment ──────────────────────────────────────────────────────────
  "hiring-pipeline": {
    module: "recruitment",
    title: "Job Openings and Candidates",
    description:
      "Track open roles, open one to see its hiring details and applicants, and review a candidate.",
    path: "/job-openings/view-job-openings",
    async run(r) {
      const p = r.page;
      await r.chapter("Job Openings");
      await r.say(
        "Job Openings lists the roles you're hiring for.",
        "Job Openings में वे roles हैं जिनके लिए आप hiring कर रहे हैं।",
      );
      await r.wait(3400);
      await r.say(
        "Each shows openings, budget, deadline and status.",
        "हर role में openings, budget, deadline और status दिखते हैं।",
      );
      await r.glide(900, 260, 900);
      await r.wait(2600);
      await r.chapter("Open a Role");
      await r.say(
        "Open a role to see its hiring details.",
        "Hiring details देखने के लिए role खोलें।",
      );
      await r.click(
        p.getByRole("main").getByText("Senior Product Designer").first(),
      );
      await r.wait(3200);
      await r.say(
        "Openings, hires, applicants and the application deadline, together.",
        "Openings, hires, applicants और application deadline, सब एक साथ।",
      );
      await r.glide(900, 220, 900);
      await r.wait(2600);
      await r.chapter("Applicants");
      await r.say(
        "Scroll down to the applicants for this role.",
        "इस role के applicants देखने के लिए नीचे scroll करें।",
      );
      const cands = p.getByRole("heading", { name: "Candidates" });
      const box = await cands.boundingBox();
      await r.scroll(Math.max(0, box.y - 120), 1600);
      await r.wait(1600);
      await r.say(
        "Filter candidates by stage, from applied to hired.",
        "Candidates को stage के हिसाब से filter करें, applied से hired तक।",
      );
      await r.point(p.getByRole("radio", { name: "All" }).first());
      await r.wait(2600);
      await r.chapter("Candidate");
      await r.say(
        "Select a candidate to review their application.",
        "किसी candidate को चुनकर उनकी application देखें।",
      );
      await r.click(p.getByRole("main").getByText("Riya Sen").first());
      await r.wait(3800);
    },
  },

  // ── Performance ──────────────────────────────────────────────────────────
  "performance-reviews": {
    module: "performance",
    title: "Performance Reviews",
    description:
      "Review cycles with a self-assessment first, then the manager’s review, with status at each step.",
    path: "/performance-reviews/reviews",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Performance Reviews run in cycles, such as each half-year.",
        "Performance Reviews cycles में चलते हैं, जैसे हर छह महीने।",
      );
      await r.wait(3400);
      await r.chapter("My Reviews");
      await r.say(
        "You rate yourself first, then your manager reviews you.",
        "पहले आप ख़ुद को rate करते हैं, फिर आपका manager review करता है।",
      );
      await r.glide(700, 260, 900);
      await r.wait(3000);
      await r.say(
        "Status shows what's due: your self-assessment or the manager's review.",
        "Status बताता है कि क्या बाकी है: self-assessment या manager review।",
      );
      await r.glide(1330, 270, 900);
      await r.wait(3000);
      await r.chapter("Reviews I Give");
      await r.say(
        "Managers see the reviews they need to give.",
        "Managers को वे reviews दिखते हैं जो उन्हें देने हैं।",
      );
      await r.click(p.getByRole("tab", { name: /Reviews I Give/ }));
      await r.wait(3200);
      await r.chapter("Review Cycles");
      await r.say(
        "HR creates and manages the cycles themselves.",
        "HR ख़ुद cycles बनाता और manage करता है।",
      );
      await nav(r, "Performance", "Review Cycles");
      await r.wait(3000);
    },
  },

  // ── Reports & analytics ──────────────────────────────────────────────────
  "report-builder": {
    module: "reports",
    title: "Report Builder",
    description:
      "Pick a data source and columns, run the report, then save it or download it as CSV.",
    path: "/reports/report-builder",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Report Builder answers your own questions about your people data.",
        "Report Builder से आप अपने people data पर ख़ुद के सवालों के जवाब पा सकते हैं।",
      );
      await r.wait(3600);
      await r.chapter("Choose Columns");
      await r.say(
        "Choose the data, then tick the columns you need.",
        "Data चुनें, फिर ज़रूरी columns पर tick करें।",
      );
      await r.point(p.getByRole("button", { name: "Employee" }));
      await r.wait(1000);
      const boxes = p.getByRole("main").locator('input[type="checkbox"]');
      for (const i of [5, 6]) {
        const b = boxes.nth(i);
        if (await b.count()) {
          await r.click(b);
          await r.wait(600);
        }
      }
      await r.wait(1200);
      await r.chapter("Filters and Sorting");
      await r.say(
        "Add filters, sort the results and set a row limit.",
        "Filters जोड़ें, results को sort करें और row limit तय करें।",
      );
      await r.point(p.getByRole("button", { name: "Add Filter" }));
      await r.wait(2600);
      await r.chapter("Run");
      await r.say(
        "Run it to see the results.",
        "Results देखने के लिए Run करें।",
      );
      await r.click(p.getByRole("button", { name: "Run" }));
      await r.wait(3200);
      await r.chapter("Save or Export");
      await r.say(
        "Save the report to run again later, or download it as CSV.",
        "Report save करें ताकि बाद में फिर चला सकें, या CSV में download करें।",
      );
      await r.point(p.getByRole("button", { name: "Save" }));
      await r.wait(1200);
      await r.point(p.getByRole("button", { name: "CSV" }));
      await r.wait(2600);
    },
  },

  "employee-insights": {
    module: "reports",
    title: "Workforce Insights",
    description:
      "Headcount, workforce status and people by department, at a glance for HR and leadership.",
    path: "/employee-management/insights",
    async run(r) {
      await r.chapter("Introduction");
      await r.say(
        "Employee Insights gives HR and leadership the big picture.",
        "Employee Insights से HR और leadership को पूरी तस्वीर मिलती है।",
      );
      await r.wait(3400);
      await r.chapter("Headcount");
      await r.say(
        "Total, active, resigned and terminated employees.",
        "कुल, active, resigned और terminated employees।",
      );
      await r.glide(520, 170, 800);
      await r.wait(800);
      await r.glide(1300, 170, 1200);
      await r.wait(1600);
      await r.chapter("Workforce Status");
      await r.say(
        "Workforce status shows the split across employment states.",
        "Workforce status बताता है कि लोग किस employment स्थिति में हैं।",
      );
      await r.glide(560, 300, 900);
      await r.wait(3000);
      await r.chapter("By Department");
      await r.say(
        "Headcount by department shows where your people are.",
        "Department के हिसाब से headcount बताता है कि आपके लोग कहाँ हैं।",
      );
      await r.glide(1150, 360, 900);
      await r.wait(3200);
      await r.chapter("Coverage");
      await r.say(
        "Lower down: active rate, PF and WFH coverage by department.",
        "नीचे: department के हिसाब से active rate, PF और WFH coverage।",
      );
      await r.scroll(320, 1100);
      await r.wait(3400);
    },
  },

  // ── Security & access control ────────────────────────────────────────────
  "roles-permissions": {
    module: "security",
    title: "Role-Based Access Control",
    description:
      "Roles bundle permissions, and each permission has a scope: the person’s own records, their team’s, or everyone’s.",
    path: "/permissions/manage-roles",
    async run(r) {
      const p = r.page;
      await r.chapter("Roles");
      await r.say(
        "Praesto uses Role-Based Access Control.",
        "Praesto में Role-Based Access Control है।",
      );
      await r.wait(3000);
      await r.say(
        "A role is a named set of permissions, given to people.",
        "Role permissions का एक नामित समूह है, जो लोगों को दिया जाता है।",
      );
      await r.glide(1300, 210, 900);
      await r.wait(2600);
      await r.chapter("Open a Role");
      await r.say(
        "Open a role to see exactly what it allows.",
        "Role खोलकर देखें कि वह ठीक-ठीक क्या करने देता है।",
      );
      await r.click(
        p.getByRole("main").getByText("Team Lead", { exact: true }).first(),
      );
      await r.wait(2600);
      await r.chapter("Own, Team, Everyone");
      await r.say(
        "Each permission has a scope: Own, Team, or Everyone.",
        "हर permission का एक scope होता है: Own, Team, या Everyone।",
      );
      await r.click(p.getByRole("button", { name: /^Attendance/ }).last());
      await r.wait(3200);
      await r.say(
        "A Team Lead can see their own and their team's attendance, not everyone's.",
        "Team Lead अपनी और अपनी team की attendance देख सकता है, सबकी नहीं।",
      );
      await r.wait(3400);
      await r.chapter("Leave Approvals");
      await r.say(
        "And approve leave for their team only.",
        "और सिर्फ़ अपनी team की leave approve कर सकता है।",
      );
      await r.click(p.getByRole("button", { name: /^Leave/ }).last());
      await r.wait(3200);
      await r.say(
        "The server checks every request against these permissions.",
        "Server हर request को इन्हीं permissions से जाँचता है।",
      );
      await r.wait(3000);
    },
  },

  "passkeys-and-audit": {
    module: "security",
    title: "Passkeys and the Audit Log",
    description:
      "Passwordless sign-in with WebAuthn passkeys, and an audit log of who changed what, and when.",
    path: "/profile/security-keys",
    async run(r) {
      const p = r.page;
      await r.chapter("Passkeys");
      await r.say(
        "Praesto has no passwords. You sign in with Google or a passkey.",
        "Praesto में password नहीं होता। आप Google या passkey से sign in करते हैं।",
      );
      await r.wait(3600);
      await r.say(
        "Passkeys use WebAuthn: Touch ID, Face ID, Windows Hello or a security key.",
        "Passkeys WebAuthn पर चलते हैं: Touch ID, Face ID, Windows Hello या security key।",
      );
      await r.glide(560, 315, 900);
      await r.wait(3200);
      await r.say(
        "Each device you've added is listed, with when it was added.",
        "आपके जोड़े हुए हर device की list है, जोड़ने के समय के साथ।",
      );
      await r.glide(700, 380, 800);
      await r.wait(3000);
      await r.chapter("Audit Log");
      await r.say(
        "Admins can see who changed what, and when, in the Audit Log.",
        "Admins Audit Log में देख सकते हैं कि किसने, क्या और कब बदला।",
      );
      await nav(r, "Administration", "Audit Log").catch(async () => {
        await p.evaluate(() => {
          history.pushState({}, "", "/audit-logs");
          dispatchEvent(new PopStateEvent("popstate"));
        });
      });
      await r.wait(3400);
      await r.chapter("Change Details");
      await r.say(
        "Select an entry to see the fields that changed.",
        "बदले गए fields देखने के लिए कोई entry चुनें।",
      );
      await r.click(p.getByText("Updated attendance settings").first());
      await r.wait(3800);
    },
  },

  // ── Notifications ────────────────────────────────────────────────────────
  notifications: {
    module: "notifications",
    title: "In-App Notifications",
    description:
      "The bell shows what changed for you, such as decisions on your requests and new announcements.",
    path: "/dashboard",
    async run(r) {
      const p = r.page;
      await r.chapter("The Bell");
      await r.say(
        "The bell shows how many updates you haven't seen yet.",
        "Bell बताती है कि कितने updates आपने अभी तक नहीं देखे।",
      );
      await r.point(p.getByRole("button", { name: /Notifications/ }));
      await r.wait(3000);
      await r.chapter("Your Notifications");
      await r.say(
        "Open it to see what changed, newest first.",
        "खोलकर देखें कि क्या बदला, सबसे नया पहले।",
      );
      await r.click(p.getByRole("button", { name: /Notifications/ }));
      await r.wait(3600);
      await r.say(
        "Decisions on your requests and updates from HR arrive here.",
        "आपकी requests पर फ़ैसले और HR के updates यहीं आते हैं।",
      );
      await r.glide(1500, 260, 900);
      await r.wait(3400);
    },
  },
};
