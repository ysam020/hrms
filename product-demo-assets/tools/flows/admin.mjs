// Workplace, Reports & Analytics, Security & Administration, AI & Support.
import { cancelDialog, main, nav } from "./common.mjs";

export const ADMIN_FLOWS = {
  // ── Workplace ────────────────────────────────────────────────────────────
  announcements: {
    module: "workplace",
    title: "Announcements",
    description:
      "HR posts company news once and everyone sees it, current items first and past ones kept for reference.",
    path: "/hr-activities",
    async run(r) {
      const p = r.page;
      await r.chapter("Company News");
      await r.say(
        "Announcements is where HR shares news with the whole company, so it isn’t lost in a group chat.",
        "Announcements वह जगह है जहाँ HR पूरी कंपनी के साथ ख़बरें साझा करता है, ताकि वे किसी group chat में खो न जाएँ।",
      );
      await r.say(
        "Each one shows its date, a title and the details everyone needs.",
        "हर announcement में उसकी तारीख, title और ज़रूरी details होती हैं।",
      );
      await r.glide(800, 300, 900);
      await r.say(
        "Deadlines, office closures and policy changes: whatever everyone should know.",
        "Deadlines, office बंद होने की सूचना और policy बदलाव: जो कुछ भी सबको पता होना चाहिए।",
      );
      await r.glide(800, 420, 900);
      await r.chapter("Past Announcements");
      await r.say(
        "Older announcements move to Past, so the current list stays short, and nothing is ever lost.",
        "पुराने announcements Past में चले जाते हैं, ताकि current list छोटी रहे, और कुछ खोए नहीं।",
      );
      await r.click(p.getByRole("radio", { name: "Past" }));
      await r.wait(1200);
      await r.click(p.getByRole("radio", { name: "Current" }));
      await r.chapter("Reaching Everyone");
      await r.say(
        "A new announcement also notifies everyone, in the app and as a push notification if they’ve turned those on.",
        "नया announcement सबको notify भी करता है, app में और push notification के रूप में, अगर उन्होंने उसे on किया है।",
      );
      await r.wait(1200);
    },
  },

  policies: {
    module: "workplace",
    title: "Company Policies",
    description:
      "Every company policy in one library: read it on screen, see when it was last updated, and download it as a PDF.",
    path: "/policy",
    async run(r) {
      const p = r.page;
      await r.chapter("The Policy Library");
      await r.say(
        "Policies keeps every company policy in one place, so employees always read the current version.",
        "Policies हर company policy एक जगह रखता है, ताकि employees हमेशा current version पढ़ें।",
      );
      await r.say(
        "The list shows each policy with its category and when it was last updated.",
        "List में हर policy उसकी category और आखिरी update की तारीख के साथ दिखती है।",
      );
      await r.glide(420, 280, 900);
      await r.chapter("Reading a Policy");
      await r.say(
        "Open a policy to read it right here, formatted and easy to scan.",
        "Policy खोलकर उसे यहीं पढ़ें, formatted और पढ़ने में आसान।",
      );
      await r.click(p.getByRole("button", { name: /Remote Work/ }));
      await r.wait(1500);
      await r.click(p.getByRole("button", { name: /Leave Policy/ }));
      await r.wait(1200);
      await r.glide(900, 420, 900);
      await r.chapter("Download");
      await r.say(
        "Need a copy? Download any policy as a PDF.",
        "Copy चाहिए? कोई भी policy PDF में download करें।",
      );
      await r.point(p.getByRole("button", { name: "Download PDF" }));
      await r.say(
        "HR writes and updates policies in the editor, and everyone sees the change straight away.",
        "HR editor में policies लिखता और update करता है, और सबको बदलाव तुरंत दिखता है।",
      );
      await r.wait(1000);
    },
  },

  helpdesk: {
    module: "workplace",
    title: "Helpdesk",
    description:
      "Employees raise tickets for IT, HR or payroll questions; the team tracks priority, response targets and replies, with internal notes for HR only.",
    path: "/helpdesk",
    async run(r) {
      const p = r.page;
      await r.chapter("Tickets");
      await r.say(
        "Helpdesk turns questions for IT, HR or payroll into tickets, so nothing is forgotten.",
        "Helpdesk IT, HR या payroll के सवालों को tickets में बदल देता है, ताकि कुछ भूला न जाए।",
      );
      await r.say(
        "Each ticket has a category, a priority and a status. A ticket past its target response time is flagged as breached.",
        "हर ticket की category, priority और status होता है। Target response time से ज़्यादा पुराना ticket breached दिखता है।",
      );
      await r.glide(900, 300, 900);
      await r.glide(1250, 330, 800);
      await r.chapter("A Conversation");
      await r.say(
        "Open a ticket to see the whole conversation in one place.",
        "Ticket खोलकर पूरी बातचीत एक जगह देखें।",
      );
      await r.click(
        main(p).getByText("VPN disconnects every 20 minutes").first(),
      );
      await r.wait(1500);
      await r.scroll(300, 900);
      await r.say(
        "Reply to the employee, or add an internal note that only HR can see.",
        "Employee को reply करें, या internal note जोड़ें जिसे सिर्फ़ HR देख सकता है।",
      );
      await r.type(
        p.getByRole("textbox", { name: "Reply" }),
        "We’ve found the cause and are rolling out a fix tonight.",
        40,
      );
      await r.point(p.getByRole("switch", { name: /Internal note/ }));
      await r.say(
        "Update the status as work moves along, and the employee is kept informed.",
        "काम आगे बढ़ने पर status update करें, और employee को जानकारी मिलती रहती है।",
      );
      await r.optional("status", () =>
        r.point(p.getByRole("button", { name: "Status" })),
      );
      await r.chapter("New Ticket");
      await r.say(
        "Raising a ticket is quick: a title, a category, a priority and a description.",
        "Ticket बनाना आसान है: title, category, priority और description।",
      );
      await r.navigate("/helpdesk");
      await r.click(p.getByRole("button", { name: "New Ticket" }));
      await r.wait(900);
      await r.type(
        p.getByRole("textbox", { name: "Title" }),
        "Need a second monitor",
        60,
      );
      await r.wait(800);
      await cancelDialog(r);
    },
  },

  notifications: {
    module: "workplace",
    title: "Notifications",
    description:
      "The bell shows what changed for you: decisions on your requests, new announcements and things waiting on you, in the app and as push notifications.",
    path: "/dashboard",
    async run(r) {
      const p = r.page;
      await r.chapter("The Bell");
      await r.say(
        "Notifications tell you when something changes that matters to you, so you don’t have to keep checking.",
        "Notifications बताते हैं कि आपके लिए कुछ ज़रूरी बदला है, ताकि आपको बार-बार check न करना पड़े।",
      );
      await r.say(
        "The bell, at the top of every screen, shows how many you haven’t seen.",
        "हर screen के ऊपर bell दिखाती है कि कितने notifications आपने नहीं देखे।",
      );
      await r.point(p.getByRole("button", { name: /Notifications/ }));
      await r.chapter("Your Notifications");
      await r.say(
        "Open it to see what changed, newest first.",
        "खोलकर देखें कि क्या बदला, सबसे नया पहले।",
      );
      await r.click(p.getByRole("button", { name: /Notifications/ }));
      await r.wait(1500);
      await r.say(
        "Your leave was approved, a new announcement was posted, or someone needs your decision.",
        "आपकी leave approve हुई, नया announcement आया, या किसी को आपका फ़ैसला चाहिए।",
      );
      await r.glide(1500, 260, 900);
      await r.say(
        "Select a notification to go straight to what it’s about.",
        "Notification चुनकर सीधे उस बारे में पहुँचें।",
      );
      await r.wait(1000);
      await r.chapter("Push Notifications");
      await r.say(
        "Turn on push notifications, and the same alerts reach your phone or laptop even when Praesto is closed.",
        "Push notifications on करें, और वही alerts आपके phone या laptop पर पहुँचते हैं, Praesto बंद होने पर भी।",
      );
      await r.page.keyboard.press("Escape");
      await r.navigate("/profile/push-notifications");
      await r.say(
        "My Profile lists every device that receives them, so you’re always in control.",
        "My Profile में हर वह device है जिस पर ये आते हैं, ताकि नियंत्रण हमेशा आपके हाथ में रहे।",
      );
      await r.wait(1200);
    },
  },

  // ── Reports & analytics ──────────────────────────────────────────────────
  "report-builder": {
    module: "reports",
    title: "Report Builder",
    description:
      "Pick a data source and columns, add filters and sorting, run it, then save the report to run again or download it as CSV.",
    path: "/reports/report-builder",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Report Builder answers your own questions about your people data, without asking anyone to write a report.",
        "Report Builder आपके people data पर आपके अपने सवालों के जवाब देता है, किसी से report बनवाए बिना।",
      );
      await r.chapter("Choose the Data");
      await r.say(
        "Start with the data you need, such as employees, attendance or leave.",
        "उस data से शुरू करें जो आपको चाहिए, जैसे employees, attendance या leave।",
      );
      await r.point(p.getByRole("button", { name: "Employee" }));
      await r.chapter("Choose Columns");
      await r.say(
        "Then tick the columns you want, like joining date and employee status.",
        "फिर अपने चाहे columns पर tick करें, जैसे joining date और employee status।",
      );
      const boxes = main(p).locator('input[type="checkbox"]');
      for (const i of [5, 6]) {
        const b = boxes.nth(i);
        if (await b.count()) {
          await r.click(b);
          await r.wait(500);
        }
      }
      await r.chapter("Filters and Sorting");
      await r.say(
        "Add filters to narrow it down, choose how to sort, and set a row limit.",
        "Filters जोड़कर दायरा छोटा करें, sort करने का तरीका चुनें, और row limit तय करें।",
      );
      await r.point(p.getByRole("button", { name: "Add Filter" }));
      await r.glide(330, 640, 800);
      await r.chapter("Run");
      await r.say(
        "Run it, and the results appear straight away.",
        "Run करें, और results तुरंत दिख जाते हैं।",
      );
      await r.click(p.getByRole("button", { name: "Run" }));
      await r.wait(1600);
      await r.chapter("Save or Export");
      await r.say(
        "Save the report to run it again whenever you like, or download it as a CSV for a spreadsheet.",
        "Report save करें ताकि जब चाहें फिर चला सकें, या spreadsheet के लिए CSV में download करें।",
      );
      await r.point(p.getByRole("button", { name: "Save" }));
      await r.point(p.getByRole("button", { name: "CSV" }));
      await r.say(
        "Saved reports always run on fresh data. You’ll find them all in Saved Reports.",
        "Saved reports हमेशा ताज़ा data पर चलती हैं। ये सब Saved Reports में मिलती हैं।",
      );
      await nav(r, "Reports", "Saved Reports");
      await r.wait(1200);
    },
  },

  analytics: {
    module: "reports",
    title: "Analytics",
    description:
      "Ready-made dashboards for the workforce, leave and attendance, and recruitment: headcount growth, joiners, attendance trends, leave patterns and the hiring funnel.",
    path: "/analytics/workforce",
    async run(r) {
      const p = r.page;
      await r.chapter("Workforce");
      await r.say(
        "Analytics gives leaders ready-made dashboards, built from the data Praesto already has.",
        "Analytics leaders को तैयार dashboards देता है, उसी data से बने जो Praesto के पास पहले से है।",
      );
      await r.say(
        "Workforce shows how many people you have, how many work from the office or from home, and how headcount has grown.",
        "Workforce दिखाता है कि आपके पास कितने लोग हैं, कितने office या घर से काम करते हैं, और headcount कैसे बढ़ा।",
      );
      await r.glide(800, 380, 1000);
      await r.say(
        "Further down: new joiners each month, employment status, departments, age groups and tenure.",
        "नीचे: हर महीने के नए joiners, employment status, departments, age groups और tenure।",
      );
      await r.scroll(450, 1300);
      await r.wait(800);
      await r.chapter("Leave and Attendance");
      await r.say(
        "Leave and Attendance shows the approval rate, attendance by month, working hours and leave patterns.",
        "Leave and Attendance में approval rate, महीनेवार attendance, काम के घंटे और leave patterns हैं।",
      );
      await r.navigate("/analytics/leave-attendance");
      await r.glide(800, 400, 1000);
      await r.say(
        "A spike in leave before a holiday, or attendance dipping in one month, is easy to spot.",
        "Holiday से पहले leave में उछाल, या किसी महीने attendance का गिरना, आसानी से दिख जाता है।",
      );
      await r.scroll(400, 1200);
      await r.chapter("Recruitment");
      await r.say(
        "Recruitment shows the hiring funnel, from applied to hired, and applications for each role.",
        "Recruitment में hiring funnel है, applied से hired तक, और हर role के applications।",
      );
      await r.navigate("/analytics/recruitment");
      await r.glide(800, 400, 1000);
      await r.say(
        "Every chart is drawn from live data, and only people with permission can see it.",
        "हर chart live data से बनता है, और सिर्फ़ अनुमति वाले लोग इसे देख सकते हैं।",
      );
      await r.wait(1200);
    },
  },

  "employee-insights": {
    module: "reports",
    title: "Employee Insights",
    description:
      "Headcount, workforce status, people by department, and active rate, PF and work-from-home coverage by department, for HR and leadership.",
    path: "/employee-management/insights",
    async run(r) {
      await r.chapter("Introduction");
      await r.say(
        "Employee Insights gives HR and leadership a quick health check of the workforce.",
        "Employee Insights HR और leadership को workforce की सेहत की जल्दी जाँच देता है।",
      );
      await r.chapter("Headcount");
      await r.say(
        "Total, active, resigned and terminated employees, side by side.",
        "कुल, active, resigned और terminated employees, एक साथ।",
      );
      await r.glide(520, 170, 800);
      await r.glide(1300, 170, 1200);
      await r.chapter("Workforce Status");
      await r.say(
        "Workforce status shows how your people are spread across employment states.",
        "Workforce status दिखाता है कि आपके लोग किस employment स्थिति में हैं।",
      );
      await r.glide(560, 300, 900);
      await r.chapter("By Department");
      await r.say(
        "Headcount by department shows where your people are, and where you might be stretched.",
        "Department के हिसाब से headcount बताता है कि आपके लोग कहाँ हैं, और कहाँ कमी हो सकती है।",
      );
      await r.glide(1150, 360, 900);
      await r.chapter("Coverage");
      await r.say(
        "Lower down: active rate, provident fund coverage and work-from-home coverage, department by department.",
        "नीचे: department के हिसाब से active rate, provident fund coverage और work-from-home coverage।",
      );
      await r.scroll(320, 1100);
      await r.say(
        "Gaps in PF coverage, for example, show up before they become a compliance problem.",
        "जैसे PF coverage की कमी, compliance की समस्या बनने से पहले ही दिख जाती है।",
      );
      await r.wait(1000);
    },
  },

  // ── Security & administration ────────────────────────────────────────────
  "roles-permissions": {
    module: "security",
    title: "Roles, Permissions and Teams",
    description:
      "Role-Based Access Control with Own, Team and Everyone scopes; per-person permissions; and teams whose leads approve their own team’s requests.",
    path: "/permissions/manage-roles",
    async run(r) {
      const p = r.page;
      await r.chapter("Roles");
      await r.say(
        "Praesto uses Role-Based Access Control: what someone can see and do depends on their role.",
        "Praesto में Role-Based Access Control है: कोई क्या देख और कर सकता है, यह उसके role पर निर्भर है।",
      );
      await r.say(
        "A role is a named set of permissions, like Employee, Team Lead, HR Partner or Finance, given to people.",
        "Role permissions का एक नामित समूह है, जैसे Employee, Team Lead, HR Partner या Finance, जो लोगों को दिया जाता है।",
      );
      await r.glide(1300, 210, 900);
      await r.chapter("Own, Team, Everyone");
      await r.say(
        "Open a role to see exactly what it allows. Each permission has a scope: Own, Team, or Everyone.",
        "Role खोलकर देखें कि वह ठीक-ठीक क्या करने देता है। हर permission का scope होता है: Own, Team, या Everyone।",
      );
      await r.click(main(p).getByText("Team Lead", { exact: true }).first());
      await r.wait(1200);
      await r.click(p.getByRole("button", { name: /^Attendance/ }).last());
      await r.wait(1000);
      await r.say(
        "A Team Lead sees their own and their team’s attendance, but not everyone’s.",
        "Team Lead अपनी और अपनी team की attendance देखता है, सबकी नहीं।",
      );
      await r.click(p.getByRole("button", { name: /^Leave/ }).last());
      await r.wait(800);
      await r.say(
        "And can approve leave for their own team only. The server checks every request against these permissions.",
        "और सिर्फ़ अपनी team की leave approve कर सकता है। Server हर request को इन्हीं permissions से जाँचता है।",
      );
      await r.chapter("User Permissions");
      await r.say(
        "User Permissions shows what one person can do, and lets you fine-tune it beyond their role.",
        "User Permissions दिखाता है कि एक व्यक्ति क्या कर सकता है, और role से आगे उसे ठीक करने देता है।",
      );
      await r.navigate("/permissions/user-permissions");
      await r.click(p.getByRole("button", { name: "Priya Nair" }));
      await r.wait(1500);
      await r.chapter("Teams");
      await r.say(
        "Teams group people under a team leader. Leads approve their members’ requests and see them on Today.",
        "Teams लोगों को एक team leader के नीचे रखती हैं। Leads अपने members की requests approve करते हैं और उन्हें Today पर देखते हैं।",
      );
      await r.navigate("/permissions/teams");
      await r.glide(800, 300, 900);
      await r.optional("open team", () =>
        r.click(main(p).getByText("Engineering").first()),
      );
      await r.wait(1500);
    },
  },

  "audit-logs": {
    module: "security",
    title: "Audit Log",
    description:
      "Who changed what, and when: every change to settings and records, filterable by time, area and person, with before and after values and sensitive fields redacted.",
    path: "/audit-logs",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "The Audit Log records every important change in Praesto: who made it, when, and from where.",
        "Audit Log Praesto के हर ज़रूरी बदलाव को दर्ज करता है: किसने किया, कब, और कहाँ से।",
      );
      await r.say(
        "At the top, counts of the events in the period: created, updated and deleted.",
        "ऊपर, इस अवधि की events की गिनती: created, updated और deleted।",
      );
      await r.glide(560, 210, 900);
      await r.chapter("Filters");
      await r.say(
        "Narrow it down by time range, by area like payroll or permissions, or by person.",
        "Time range से, payroll या permissions जैसे area से, या व्यक्ति से दायरा छोटा करें।",
      );
      await r.point(p.getByRole("button", { name: "Time range" }));
      await r.point(p.getByRole("button", { name: "Area" }));
      await r.point(p.getByRole("combobox", { name: "Person" }));
      await r.chapter("Before and After");
      await r.say(
        "Select an entry to see exactly which fields changed, with the value before and after.",
        "कोई entry चुनकर देखें कि ठीक कौन-से fields बदले, पहले और बाद की value के साथ।",
      );
      await r.click(p.getByText("Updated attendance settings").first());
      await r.wait(1800);
      await r.chapter("Sensitive Data");
      await r.say(
        "Sensitive values, like bank details, are never stored in the log. It records that they changed, not what they are.",
        "Bank details जैसी sensitive values log में कभी नहीं रखी जातीं। यह दर्ज होता है कि वे बदलीं, यह नहीं कि वे क्या हैं।",
      );
      await r.optional("redacted", () =>
        r.click(p.getByText("Updated bank details for Sara Thomas").first()),
      );
      await r.wait(1800);
      await r.say(
        "Entries can’t be edited or deleted, so the log is a record you can rely on in an audit.",
        "Entries बदली या हटाई नहीं जा सकतीं, इसलिए audit में यह log एक भरोसेमंद record है।",
      );
    },
  },

  settings: {
    module: "security",
    title: "Organisation Settings",
    description:
      "Company details and statutory IDs, the work week, HR policy defaults like probation and notice, and more, each applied across the organisation.",
    path: "/settings/company",
    async run(r) {
      const p = r.page;
      await r.chapter("Company Info");
      await r.say(
        "Settings is where owners and admins shape Praesto to fit how the organisation works.",
        "Settings वह जगह है जहाँ owners और admins Praesto को organisation के काम करने के तरीके के हिसाब से ढालते हैं।",
      );
      await r.say(
        "Company Info holds the contact details employees see when they need help, and your statutory details.",
        "Company Info में वे contact details हैं जो employees को मदद चाहिए होने पर दिखती हैं, और आपकी statutory details।",
      );
      await r.glide(800, 400, 900);
      await r.say(
        "TAN, CIN and the authorised signatory appear on letters and filings.",
        "TAN, CIN और authorised signatory letters और filings पर आते हैं।",
      );
      await r.click(p.getByRole("button", { name: "Edit" }));
      await r.wait(1200);
      await cancelDialog(r);
      await r.chapter("Work Week");
      await r.say(
        "Work Week sets which days are working days, and every attendance and leave calculation follows it.",
        "Work Week तय करता है कि कौन-से दिन working days हैं, और attendance और leave की हर गणना इसी के हिसाब से होती है।",
      );
      await r.navigate("/settings/work-week");
      await r.glide(700, 330, 900);
      await r.chapter("HR Policy");
      await r.say(
        "HR Policy holds organisation-wide defaults: the probation period, the notice period, and how many interview rounds a candidate can have.",
        "HR Policy में organisation के default नियम हैं: probation period, notice period, और एक candidate के कितने interview rounds हो सकते हैं।",
      );
      await r.navigate("/settings/hr-policy");
      await r.glide(1100, 360, 900);
      await r.chapter("Saving Changes");
      await r.say(
        "Nothing changes until you save. When you do, Praesto asks when the change should take effect, and records it in the audit log.",
        "Save करने तक कुछ नहीं बदलता। Save करने पर Praesto पूछता है कि बदलाव कब से लागू हो, और उसे audit log में दर्ज करता है।",
      );
      await r.point(p.getByRole("button", { name: /Save Changes/ }));
      await r.wait(800);
    },
  },

  subscription: {
    module: "security",
    title: "Subscription and Billing",
    description:
      "Your plan, renewal date and payment method; switch between Starter, Growth and Enterprise, or monthly and annual billing.",
    path: "/subscription",
    async run(r) {
      const p = r.page;
      await r.chapter("Your Plan");
      await r.say(
        "Subscription shows your plan, when it renews and how you pay, all in one place.",
        "Subscription में आपका plan, कब renew होगा और आप कैसे भुगतान करते हैं, सब एक जगह दिखता है।",
      );
      await r.glide(560, 260, 900);
      await r.say(
        "Change the payment method at any time, or cancel the subscription.",
        "Payment method कभी भी बदलें, या subscription cancel करें।",
      );
      await r.point(p.getByRole("button", { name: "Change Payment Method" }));
      await r.chapter("Change Plan");
      await r.say(
        "Plans are priced by company size, not per employee. Starter covers up to 25 people, Growth up to 100, and Enterprise has no limit.",
        "Plans की कीमत company size पर है, हर employee पर नहीं। Starter 25 लोगों तक, Growth 100 तक, और Enterprise की कोई सीमा नहीं।",
      );
      await r.scroll(260, 900);
      await r.glide(560, 360, 800);
      await r.glide(1050, 360, 1100);
      await r.say(
        "Paying annually costs less than paying month by month.",
        "Annual भुगतान महीने-दर-महीने भुगतान से सस्ता पड़ता है।",
      );
      await r.click(p.getByRole("radio", { name: "Annual" }));
      await r.wait(1200);
      await r.click(p.getByRole("radio", { name: "Monthly" }));
      await r.say(
        "Every plan includes every module: attendance, leave, payroll, recruitment and the rest.",
        "हर plan में हर module शामिल है: attendance, leave, payroll, recruitment और बाकी सब।",
      );
      await r.scroll(260, 900);
      await r.wait(1000);
    },
  },

  // ── AI & support ─────────────────────────────────────────────────────────
  "ai-assistants": {
    module: "ai-support",
    title: "AI Assistants",
    description:
      "Connect the AI assistant you already use to Praesto through its MCP server, and ask about leave, approvals and your calendar, within your own permissions.",
    path: "/ai-assistants",
    async run(r) {
      const p = r.page;
      await r.chapter("Your Own Assistant");
      await r.say(
        "Praesto works with the AI assistant you already use, like Claude or ChatGPT. Ask it about your leave, approvals or calendar.",
        "Praesto उसी AI assistant के साथ काम करता है जो आप पहले से इस्तेमाल करते हैं, जैसे Claude या ChatGPT। उससे अपनी leave, approvals या calendar के बारे में पूछें।",
      );
      await r.chapter("The MCP Server");
      await r.say(
        "Add this address to your assistant. It connects through Praesto’s MCP server, a standard way for assistants to use apps.",
        "यह address अपने assistant में जोड़ें। यह Praesto के MCP server से जुड़ता है, assistants के apps इस्तेमाल करने का एक standard तरीका।",
      );
      await r.point(p.getByRole("button", { name: "Copy" }).first());
      await r.chapter("Setting Up");
      await r.say(
        "Step-by-step instructions are given for Claude Code, Claude and ChatGPT, and other assistants.",
        "Claude Code, Claude और ChatGPT, और दूसरे assistants के लिए step-by-step निर्देश दिए गए हैं।",
      );
      await r.scroll(420, 1100);
      await r.click(p.getByRole("tab", { name: /Claude & ChatGPT/ }));
      await r.wait(1200);
      await r.chapter("Your Data, Your Rules");
      await r.say(
        "Your assistant signs in through Praesto, and you choose what it may see. It can only read what you can, never change anything.",
        "आपका assistant Praesto से sign in करता है, और आप चुनते हैं कि वह क्या देख सकता है। वह वही पढ़ सकता है जो आप, कुछ बदल नहीं सकता।",
      );
      await r.scroll(400, 1100);
      await r.chapter("Connected Assistants");
      await r.say(
        "Every connected assistant is listed with what it can see and when it was last used. Disconnect it any time.",
        "हर जुड़ा assistant उसकी पहुँच और आखिरी इस्तेमाल के समय के साथ दिखता है। उसे कभी भी disconnect करें।",
      );
      await r.scroll(-820, 1200);
      await r.point(p.getByRole("button", { name: "Disconnect" }));
      await r.wait(800);
    },
  },

  support: {
    module: "ai-support",
    title: "Praesto Support",
    description:
      "Raise bugs, billing questions and ideas with the Praesto team, track every ticket’s status, and reply when they need something from you.",
    path: "/support",
    async run(r) {
      const p = r.page;
      await r.chapter("Support Tickets");
      await r.say(
        "Support connects your organisation with the Praesto team, for bugs, billing questions or ideas.",
        "Support आपके organisation को Praesto team से जोड़ता है, bugs, billing के सवालों या ideas के लिए।",
      );
      await r.say(
        "At the top: how many tickets you’ve raised, how many are open, any waiting for your reply, and how many are resolved.",
        "ऊपर: आपने कितने tickets बनाए, कितने open हैं, कौन-से आपके reply का इंतज़ार कर रहे हैं, और कितने resolved हैं।",
      );
      await r.glide(800, 210, 1000);
      await r.say(
        "Each ticket shows its number, subject, priority and status, so you always know where things stand.",
        "हर ticket में उसका number, subject, priority और status दिखता है, ताकि आपको हमेशा पता रहे कि बात कहाँ तक पहुँची।",
      );
      await r.glide(800, 420, 900);
      await r.chapter("Raising a Ticket");
      await r.say(
        "To raise a ticket, choose what it’s about: a bug, a billing question, a feature request or a security concern.",
        "Ticket बनाने के लिए चुनें कि यह किस बारे में है: bug, billing सवाल, feature request या security concern।",
      );
      await r.click(p.getByRole("button", { name: "New Ticket" }));
      await r.wait(1300);
      await r.click(p.getByRole("radio", { name: /Feature Request/ }));
      await r.say(
        "Add a subject and describe what you need. For a bug, steps to reproduce help the team fix it faster.",
        "Subject जोड़ें और बताएँ कि आपको क्या चाहिए। Bug के लिए reproduce करने के steps team को जल्दी ठीक करने में मदद करते हैं।",
      );
      await r.type(
        p.getByRole("textbox", { name: "Subject" }),
        "Export attendance as PDF",
        55,
      );
      await r.say(
        "Attach screenshots if they help, then submit. You’re notified whenever the team replies.",
        "मदद करें तो screenshots attach करें, फिर submit करें। Team के reply करते ही आपको सूचना मिलती है।",
      );
      await r.point(p.getByRole("button", { name: "Attach Files" }));
      await r.point(p.getByRole("button", { name: "Submit Ticket" }));
      await r.wait(800);
    },
  },
};
