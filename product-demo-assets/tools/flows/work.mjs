// Leave, Payroll, Recruitment and Performance demos.
import { recruitmentFixtures } from "../extras.mjs";
import { cancelDialog, main, nav, pickDate, weekday } from "./common.mjs";

export const WORK_FLOWS = {
  // ── Leave ────────────────────────────────────────────────────────────────
  "apply-leave": {
    module: "leave-management",
    title: "Applying for Leave",
    description:
      "Choose full days, a half day or a few hours, pick the dates and type, and send it to your approver with the balance and duration shown first.",
    path: "/attendance/apply-leave",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Applying for leave takes a few seconds, and there’s no form to email or message to chase.",
        "Leave के लिए apply करने में कुछ seconds लगते हैं, कोई form email करने या message के पीछे भागने की ज़रूरत नहीं।",
      );
      await r.chapter("How Long");
      await r.say(
        "First, choose how long you’ll be away: full days, a half day, or just a few hours.",
        "पहले चुनें कि आप कितनी देर दूर रहेंगे: पूरे दिन, आधा दिन, या बस कुछ घंटे।",
      );
      await r.point(p.getByRole("radio", { name: /Half Day/ }));
      await r.wait(500);
      await r.click(p.getByRole("radio", { name: /Full Days/ }));
      await r.chapter("Dates");
      await r.say(
        "Then pick the dates. Weekends and holidays are left out of the count automatically.",
        "फिर तारीख़ें चुनें। Weekends और holidays गिनती से अपने आप हट जाते हैं।",
      );
      const from = weekday(9);
      const to = new Date(from);
      to.setDate(from.getDate() + (from.getDay() === 5 ? 3 : 1));
      await pickDate(r, p.getByRole("button", { name: "From" }), from);
      await pickDate(r, p.getByRole("button", { name: "To" }), to);
      await r.chapter("Details");
      await r.say(
        "Choose the leave type, like paid, casual or sick, and add a short note for your approver.",
        "Leave type चुनें, जैसे paid, casual या sick, और approver के लिए छोटा note जोड़ें।",
      );
      await r.point(p.getByRole("button", { name: "Leave Type" }));
      await r.type(
        p.getByRole("textbox", { name: "Reason" }),
        "Family function in Kochi",
        60,
      );
      await r.say(
        "For sick leave, switch on This is sick leave, and attach a medical certificate if your policy needs one.",
        "Sick leave के लिए This is sick leave on करें, और policy माँगे तो medical certificate attach करें।",
      );
      await r.point(p.getByRole("switch", { name: /sick leave/i }));
      await r.chapter("Review");
      await r.say(
        "Your Request sums up the type, dates and duration, and your available balance is shown before you send.",
        "Your Request में type, तारीख़ें और अवधि दिखती है, और भेजने से पहले आपका बचा हुआ balance भी।",
      );
      await r.glide(1260, 330, 900);
      await r.chapter("Submit");
      await r.say(
        "Submit, and it goes straight to your approver. You’ll get a notification when they decide.",
        "Submit करें, और request सीधे आपके approver के पास जाती है। फ़ैसला होते ही आपको notification मिलेगा।",
      );
      await r.click(p.getByRole("button", { name: "Submit Request" }));
      await r.wait(1500);
    },
  },

  "approve-leave": {
    module: "leave-management",
    title: "Manager Approval",
    description:
      "Managers see their team’s leave requests, filter by status, check dates and reasons, and approve or reject, one at a time or in bulk.",
    path: "/attendance/view-leave-applications",
    async run(r) {
      const p = r.page;
      await r.chapter("Leave Applications");
      await r.say(
        "Leave Applications shows the requests you’re responsible for: your team’s, or the whole company’s if you’re HR.",
        "Leave Applications में वे requests दिखती हैं जिनकी ज़िम्मेदारी आपकी है: आपकी team की, या HR हैं तो पूरी कंपनी की।",
      );
      await r.chapter("Filter");
      await r.say(
        "Filter by status to focus on what’s pending, or look back at what was approved or rejected.",
        "Status से filter करें और pending पर ध्यान दें, या देखें कि क्या approved या rejected हुआ।",
      );
      await r.click(p.getByRole("radio", { name: "Pending" }));
      await r.wait(1000);
      await r.say(
        "Upcoming only hides leave that has already passed, so planning ahead is easy.",
        "Upcoming only बीत चुकी leaves छिपा देता है, ताकि आगे की योजना आसान रहे।",
      );
      await r.point(p.getByRole("switch", { name: "Upcoming only" }));
      await r.chapter("Review a Request");
      await r.say(
        "Each request shows who’s asking, the dates, the reason and the status.",
        "हर request में कौन माँग रहा है, तारीख़ें, कारण और status दिखता है।",
      );
      await r.glide(860, 250, 1000);
      await r.chapter("Several at Once");
      await r.say(
        "Tick several requests to approve or reject them together, useful before a long weekend.",
        "कई requests पर tick करके उन्हें एक साथ approve या reject करें, लंबे weekend से पहले काम आता है।",
      );
      await r.optional("select", async () => {
        const boxes = main(p).locator('td input[type="checkbox"]');
        await r.click(boxes.nth(0));
        await r.wait(400);
        await r.click(boxes.nth(1));
        await r.wait(1800);
        await r.click(boxes.nth(1));
        await r.wait(300);
        await r.click(boxes.nth(0));
        await r.wait(500);
      });
      await r.chapter("Approve");
      await r.say(
        "Approve it, and the employee is notified, their balance is updated and the leave appears on the calendar.",
        "Approve करें, और employee को सूचना मिलती है, उनका balance update होता है और leave calendar पर दिख जाती है।",
      );
      await r.click(p.getByRole("button", { name: "Approve" }).first());
      await r.wait(1000);
      await r.optional("confirm", async () => {
        const c = p
          .getByRole("dialog")
          .getByRole("button", { name: /Approve/ });
        if (await c.count()) await r.click(c);
      });
    },
  },

  "leave-policy": {
    module: "leave-management",
    title: "Leave Policy",
    description:
      "Set yearly paid, sick and casual leave, require a medical certificate for sick leave, and add your own leave types with accrual, carry forward and encashment.",
    path: "/settings/leave",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Leave Policy turns your company’s leave rules into settings that Praesto applies automatically.",
        "Leave Policy आपकी कंपनी के leave rules को settings में बदल देती है, जिन्हें Praesto अपने आप लागू करता है।",
      );
      await r.chapter("Statutory Entitlement");
      await r.say(
        "Set how many paid, sick and casual leave days each person gets a year.",
        "तय करें कि हर व्यक्ति को साल में कितनी paid, sick और casual leaves मिलें।",
      );
      await r.point(p.getByLabel("Paid leave days"));
      await r.point(p.getByLabel("Sick leave days"));
      await r.point(p.getByLabel("Casual leave days"));
      await r.say(
        "Balances, approvals and payroll all read from these numbers, so there’s one source of truth.",
        "Balances, approvals और payroll सब इन्हीं numbers से चलते हैं, तो सच का एक ही स्रोत है।",
      );
      await r.chapter("Medical Certificates");
      await r.say(
        "Optionally, require a medical certificate whenever someone applies for sick leave.",
        "चाहें तो sick leave के हर आवेदन पर medical certificate ज़रूरी कर दें।",
      );
      await r.click(
        p.getByRole("switch", { name: "Require medical certificate" }),
      );
      await r.wait(800);
      await r.chapter("Your Own Leave Types");
      await r.say(
        "Add leave types of your own, like comp off or bereavement leave.",
        "अपने leave types जोड़ें, जैसे comp off या bereavement leave।",
      );
      await r.click(p.getByRole("button", { name: "Add Leave Type" }));
      await r.wait(1200);
      await r.say(
        "Each type can accrue monthly, carry forward to next year, and be encashed, exactly as your policy says.",
        "हर type monthly accrue हो सकता है, अगले साल carry forward हो सकता है, और encash हो सकता है, ठीक आपकी policy के मुताबिक।",
      );
      await r.wait(800);
      await r.optional("cancel", () => cancelDialog(r));
      await r.say(
        "Nothing changes until you save, and saving asks when the change should take effect.",
        "Save करने तक कुछ नहीं बदलता, और save करते समय पूछा जाता है कि बदलाव कब से लागू हो।",
      );
    },
  },

  // ── Payroll ──────────────────────────────────────────────────────────────
  "payroll-runs": {
    module: "payroll",
    title: "Payroll Runs",
    description:
      "Each month’s payroll moves from draft through review and approval to disbursal, with employees, gross and net totals at every step.",
    path: "/payroll/payroll-runs",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Payroll Runs is where each month’s salaries are calculated, checked and paid.",
        "Payroll Runs वह जगह है जहाँ हर महीने की salaries की गणना, जाँच और भुगतान होता है।",
      );
      await r.say(
        "A run takes attendance, leave and salary structures into account, so nobody types numbers into a spreadsheet.",
        "एक run attendance, leave और salary structures को ध्यान में रखता है, ताकि किसी को spreadsheet में numbers न टाइप करने पड़ें।",
      );
      await r.chapter("Latest Run");
      await r.say(
        "The latest run shows how many employees it covers, the total gross and the total net pay.",
        "Latest run बताता है कि उसमें कितने employees हैं, total gross और total net pay कितना है।",
      );
      await r.glide(800, 300, 900);
      await r.chapter("Approval Steps");
      await r.say(
        "Every run moves through clear steps: draft, in review, approved, and disbursed.",
        "हर run साफ़ steps से गुज़रता है: draft, review, approved, और disbursed।",
      );
      await r.glide(560, 220, 900);
      await r.say(
        "Someone reviews and approves each run before anyone is paid, so mistakes are caught early.",
        "किसी को भी भुगतान से पहले हर run review और approve होता है, ताकि गलतियाँ जल्दी पकड़ी जाएँ।",
      );
      await r.chapter("Run History");
      await r.say(
        "The history lists every run with its status. Filter to see, for example, only disbursed runs.",
        "History में हर run अपने status के साथ है। Filter करके देखें, जैसे सिर्फ़ disbursed runs।",
      );
      await r.scroll(220, 900);
      await r.click(p.getByRole("radio", { name: "Disbursed" }));
      await r.wait(1000);
      await r.click(p.getByRole("radio", { name: "All" }));
      await r.wait(600);
      await r.say(
        "A draft can be submitted for approval when it’s ready. If a bank transfer fails, retry just those payouts.",
        "Draft तैयार होने पर approval के लिए भेजा जा सकता है। अगर bank transfer fail हो, तो सिर्फ़ वही payouts दोबारा करें।",
      );
      await r.point(p.getByRole("button", { name: "Submit for Approval" }));
      await r.optional("retry", () =>
        r.point(p.getByRole("button", { name: "Retry Payouts" }).first()),
      );
      await r.chapter("New Run");
      await r.say(
        "Start a new month with New Payroll Run.",
        "नया महीना New Payroll Run से शुरू करें।",
      );
      await r.point(p.getByRole("button", { name: "New Payroll Run" }));
      await r.wait(800);
    },
  },

  payslips: {
    module: "payroll",
    title: "Payslips",
    description:
      "Employees see their latest payslip and its deductions, and download any month’s payslip or TDS worksheet as a PDF.",
    path: "/payroll/my-payslips",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "My Payslips gives every employee their salary statements, without asking HR to email them.",
        "My Payslips हर employee को उनकी salary statements देता है, HR से email माँगे बिना।",
      );
      await r.chapter("Latest Payslip");
      await r.say(
        "The latest payslip shows take-home pay after deductions, in large figures.",
        "Latest payslip में deductions के बाद की take-home salary बड़े अंकों में दिखती है।",
      );
      await r.glide(420, 260, 900);
      await r.say(
        "Below it, gross pay, deductions and net pay. The bar shows how much goes to deductions.",
        "उसके नीचे gross pay, deductions और net pay। Bar दिखाता है कि कितना deductions में जाता है।",
      );
      await r.glide(780, 390, 1000);
      await r.say(
        "Deductions are itemised: provident fund, TDS, and any salary advance being repaid.",
        "Deductions अलग-अलग दिखते हैं: provident fund, TDS, और वापस हो रहा salary advance।",
      );
      await r.glide(560, 420, 900);
      await r.chapter("History");
      await r.say(
        "Every earlier month is listed too, with gross, deductions and net.",
        "पिछले सभी महीने भी gross, deductions और net के साथ दिखते हैं।",
      );
      await r.scroll(200, 900);
      await r.say(
        "Download any payslip as a PDF for a loan or visa application, and the TDS worksheet for tax filing.",
        "Loan या visa के लिए कोई भी payslip PDF में download करें, और tax filing के लिए TDS worksheet।",
      );
      await r.point(
        p.getByRole("button", { name: "Download payslip for August 2026" }),
      );
      await r.point(
        p.getByRole("button", {
          name: "Download TDS worksheet for August 2026",
        }),
      );
      await r.wait(800);
    },
  },

  "payroll-setup": {
    module: "payroll",
    title: "Salary Structures and Payroll Setup",
    description:
      "Define salary components, professional tax, pay cycles and income tax once; see every employee’s salary in Salary Management.",
    path: "/settings/payroll",
    async run(r) {
      const p = r.page;
      await r.chapter("Payroll Setup");
      await r.say(
        "Payroll Setup is where you describe how your company pays people. Every payroll run follows it.",
        "Payroll Setup वह जगह है जहाँ आप बताते हैं कि आपकी कंपनी लोगों को कैसे भुगतान करती है। हर payroll run इसी के हिसाब से चलता है।",
      );
      await r.chapter("Salary Components");
      await r.say(
        "Salary Components lists the earnings and deductions that make up a salary.",
        "Salary Components में वे earnings और deductions हैं जिनसे salary बनती है।",
      );
      await r.glide(800, 330, 900);
      await r.say(
        "Each is a fixed amount, a percentage of basic, or a statutory formula like provident fund, and is marked taxable or not.",
        "हर component एक fixed amount, basic का percentage, या provident fund जैसा statutory formula होता है, और taxable है या नहीं, यह marked होता है।",
      );
      await r.glide(1150, 330, 900);
      await r.point(p.getByRole("button", { name: "Add Component" }));
      await r.chapter("Tax and Pay Cycles");
      await r.say(
        "Professional Tax holds your state’s slabs, Pay Cycles sets when each month’s payroll runs, and Income Tax holds the TDS slabs.",
        "Professional Tax में आपके राज्य के slabs, Pay Cycles में हर महीने payroll कब चले, और Income Tax में TDS slabs हैं।",
      );
      await r.optional("pt", () =>
        r.click(
          p
            .getByRole("radio", { name: /Professional Tax/ })
            .or(p.getByRole("tab", { name: /Professional Tax/ })),
        ),
      );
      await r.wait(1000);
      await r.optional("pay cycles", () =>
        r.click(
          p
            .getByRole("radio", { name: /Pay Cycles/ })
            .or(p.getByRole("tab", { name: /Pay Cycles/ })),
        ),
      );
      await r.wait(1000);
      await r.optional("back", () =>
        r.click(
          p
            .getByRole("radio", { name: /Salary Components/ })
            .or(p.getByRole("tab", { name: /Salary Components/ })),
        ),
      );
      await r.chapter("Salary Management");
      await r.say(
        "Salary Management lists every employee, and from here HR sets up or revises each person’s salary.",
        "Salary Management में हर employee है, और यहीं से HR हर व्यक्ति की salary set up या revise करता है।",
      );
      await r.navigate("/payroll/salary-management");
      await r.glide(800, 360, 900);
      await r.say(
        "Search for anyone by name. Salary details are visible only to people whose role allows it.",
        "किसी को भी नाम से search करें। Salary details सिर्फ़ उन्हें दिखती हैं जिनके role में इसकी अनुमति है।",
      );
      await r.type(p.getByPlaceholder("Search employees"), "Kabir", 100);
      await r.wait(1200);
    },
  },

  // ── Recruitment ──────────────────────────────────────────────────────────
  "hiring-pipeline": {
    module: "recruitment",
    title: "Job Openings and Candidates",
    description:
      "Track open roles with budgets and deadlines, open one to see its hiring details and applicants, filter by stage and review a candidate.",
    path: "/job-openings/view-job-openings",
    extra: recruitmentFixtures(),
    async run(r) {
      const p = r.page;
      await r.chapter("Job Openings");
      await r.say(
        "Recruitment brings hiring into the same place as everything else, from the job opening to the hire.",
        "Recruitment hiring को बाकी सब के साथ एक जगह ले आता है, job opening से लेकर hire तक।",
      );
      await r.say(
        "Job Openings lists the roles you’re hiring for, with the number of openings, budget, deadline and status.",
        "Job Openings में वे roles हैं जिनके लिए hiring हो रही है, openings की संख्या, budget, deadline और status के साथ।",
      );
      await r.glide(900, 260, 900);
      await r.point(
        p
          .getByRole("button", { name: "New Opening" })
          .or(p.getByRole("link", { name: "New Opening" })),
      );
      await r.chapter("One Role");
      await r.say(
        "Open a role to see its hiring details: openings, hires so far, applicants and the application deadline.",
        "Role खोलकर उसकी hiring details देखें: openings, अब तक के hires, applicants और application deadline।",
      );
      await r.click(main(p).getByText("Senior Product Designer").first());
      await r.wait(1500);
      await r.glide(900, 220, 900);
      await r.say(
        "The hiring manager, recruiter, budget and screening are all recorded with the role.",
        "Hiring manager, recruiter, budget और screening सब role के साथ दर्ज रहते हैं।",
      );
      await r.glide(1200, 400, 900);
      await r.chapter("Description");
      await r.say(
        "The description, responsibilities, qualifications and skills are what candidates see on your careers page.",
        "Description, responsibilities, qualifications और skills वही हैं जो candidates आपके careers page पर देखते हैं।",
      );
      await r.scroll(500, 1200);
      await r.chapter("Candidates");
      await r.say(
        "Further down are the candidates. Filter by stage, from applied to interviewing, hired or rejected.",
        "नीचे candidates हैं। Stage से filter करें, applied से interviewing, hired या rejected तक।",
      );
      const cands = p.getByRole("heading", { name: "Candidates" });
      const box = await cands.boundingBox();
      await r.scroll(Math.max(0, box.y - 120), 1200);
      await r.click(p.getByRole("radio", { name: "Interviewing" }));
      await r.wait(1000);
      await r.click(p.getByRole("radio", { name: "All" }).first());
      await r.chapter("A Candidate");
      await r.say(
        "Select a candidate to see their contact details, résumé and every interview round with its outcome.",
        "Candidate चुनकर उनकी contact details, résumé और हर interview round उसके नतीजे के साथ देखें।",
      );
      await r.click(main(p).getByText("Riya Sen").first());
      await r.wait(1800);
    },
  },

  "recruitment-pipeline": {
    module: "recruitment",
    title: "Hiring Pipelines and Careers Page",
    description:
      "Define your interview rounds once as pipelines, and publish openings on a public careers page where candidates apply.",
    path: "/settings/recruitment-pipeline",
    async run(r) {
      const p = r.page;
      await r.chapter("Pipelines");
      await r.say(
        "A pipeline is the series of interview rounds a job goes through, so every candidate gets the same fair process.",
        "Pipeline interview rounds की वह series है जिससे एक job गुज़रती है, ताकि हर candidate को एक जैसा, निष्पक्ष process मिले।",
      );
      await r.glide(560, 260, 900);
      await r.say(
        "Each round has an owner, like HR or the hiring manager, and can include background verification.",
        "हर round का एक owner होता है, जैसे HR या hiring manager, और उसमें background verification भी हो सकता है।",
      );
      await r.glide(800, 300, 900);
      await r.say(
        "Keep a few pipelines, like a standard one and a short one for interns, and make one the default.",
        "कुछ pipelines रखें, जैसे एक standard और interns के लिए छोटा, और एक को default बनाएँ।",
      );
      await r.optional("default", () =>
        r.point(p.getByRole("button", { name: "Make Default" })),
      );
      await r.point(p.getByRole("button", { name: "New Pipeline" }));
      await r.chapter("Careers Page");
      await r.say(
        "Every organisation gets a public careers page. Open roles appear there automatically.",
        "हर organisation को एक public careers page मिलता है। Open roles वहाँ अपने आप दिखते हैं।",
      );
      await r.navigate("/careers/halcyon-labs");
      await r.wait(800);
      await r.glide(700, 360, 900);
      await r.say(
        "Candidates read about the role and apply with their résumé, and their application lands straight in the role’s candidate list.",
        "Candidates role के बारे में पढ़कर अपने résumé के साथ apply करते हैं, और application सीधे role की candidate list में पहुँचती है।",
      );
      await r.optional("open role", () =>
        r.point(p.getByRole("heading", { name: "Senior Product Designer" })),
      );
      await r.say(
        "No job board subscriptions, and no forwarding résumés by email.",
        "न job board subscriptions, न résumés email से forward करना।",
      );
      await r.wait(800);
    },
  },

  // ── Performance ──────────────────────────────────────────────────────────
  "performance-reviews": {
    module: "performance",
    title: "Performance Reviews",
    description:
      "Review cycles with a self-assessment first and the manager’s review after, statuses that show what’s due, and HR setting up cycles.",
    path: "/performance-reviews/reviews",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Performance Reviews give every employee a regular, structured conversation about their work, instead of an annual surprise.",
        "Performance Reviews हर employee को उनके काम पर नियमित, व्यवस्थित बातचीत देते हैं, साल में एक बार के surprise की जगह।",
      );
      await r.chapter("Review Cycles");
      await r.say(
        "Reviews run in cycles, such as one each half-year. Everyone in a cycle is reviewed on the same scale.",
        "Reviews cycles में चलते हैं, जैसे हर छह महीने में एक। एक cycle में सबका review एक ही scale पर होता है।",
      );
      await r.glide(700, 260, 900);
      await r.chapter("My Reviews");
      await r.say(
        "In My Reviews, you rate yourself first. Then your manager reviews you, and you see both.",
        "My Reviews में पहले आप ख़ुद को rate करते हैं। फिर आपका manager review करता है, और आप दोनों देखते हैं।",
      );
      await r.glide(1000, 300, 900);
      await r.say(
        "Status shows what’s due next: your self-assessment, or your manager’s review.",
        "Status बताता है कि आगे क्या बाकी है: आपका self-assessment, या manager का review।",
      );
      await r.glide(1330, 270, 900);
      await r.chapter("Reviews I Give");
      await r.say(
        "Managers see the reviews they need to give in Reviews I Give, so nobody on their team is forgotten.",
        "Managers को Reviews I Give में वे reviews दिखते हैं जो उन्हें देने हैं, ताकि team का कोई छूट न जाए।",
      );
      await r.click(p.getByRole("tab", { name: /Reviews I Give/ }));
      await r.wait(1500);
      await r.chapter("Managing Cycles");
      await r.say(
        "HR creates and manages cycles in Review Cycles: draft, active and closed.",
        "HR Review Cycles में cycles बनाता और manage करता है: draft, active और closed।",
      );
      await nav(r, "Performance", "Review Cycles");
      await r.say(
        "A new cycle sets its scale and period, and opens reviews for everyone it covers.",
        "नया cycle अपना scale और period तय करता है, और उसमें शामिल सभी के लिए reviews खोल देता है।",
      );
      await r.point(p.getByRole("button", { name: "New Cycle" }));
      await r.wait(800);
    },
  },
};
