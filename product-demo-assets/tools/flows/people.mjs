// Employees and Attendance demos.
import {
  cancelDialog,
  choose,
  main,
  nav,
  pickDate,
  weekday,
} from "./common.mjs";

export const PEOPLE_FLOWS = {
  // ── Employees ────────────────────────────────────────────────────────────
  "employee-directory": {
    module: "employee-management",
    title: "Employee Directory and Profiles",
    description:
      "Every employee in one searchable directory, and a full profile for each: work details, contact, statutory numbers and the assets they hold.",
    path: "/employee-management/employee-list",
    async run(r) {
      const p = r.page;
      await r.chapter("Directory");
      await r.say(
        "The Employee Directory replaces the spreadsheet most companies keep. Everyone is here, always up to date.",
        "Employee Directory उस spreadsheet की जगह लेता है जो ज़्यादातर कंपनियाँ रखती हैं। सब यहाँ हैं, हमेशा up to date।",
      );
      await r.say(
        "Each row shows a person’s designation, department and joining date.",
        "हर row में व्यक्ति का designation, department और joining date दिखता है।",
      );
      await r.glide(900, 300, 900);
      await r.say(
        "KYC status tells HR at a glance whose documents are approved and who still has something to submit.",
        "KYC status से HR एक नज़र में देख लेता है कि किसके documents approved हैं और किसे अभी कुछ जमा करना है।",
      );
      await r.glide(1330, 330, 900);
      await r.chapter("Search");
      await r.say(
        "Search by name, email or username to find anyone in seconds.",
        "नाम, email या username से search करें और किसी को भी seconds में ढूंढें।",
      );
      await r.type(
        p.getByPlaceholder("Search by name, email, or username"),
        "Priya",
        110,
      );
      await r.wait(800);
      await r.chapter("Employee Profile");
      await r.say(
        "Open a profile for the complete picture. Work details show their username, work email, department and when they joined.",
        "पूरी जानकारी के लिए profile खोलें। Work details में username, work email, department और joining date दिखते हैं।",
      );
      await r.click(main(p).getByText("Priya Nair").first());
      await r.wait(1500);
      await r.say(
        "Personal details come from their KYC, so HR doesn’t have to collect them twice.",
        "Personal details उनके KYC से आती हैं, ताकि HR को उन्हें दोबारा इकट्ठा न करना पड़े।",
      );
      await r.glide(1150, 360, 900);
      await r.chapter("Statutory and Assets");
      await r.say(
        "Statutory numbers like PF and UAN sit with the record that payroll uses, and so do the laptops and phones assigned to them.",
        "PF और UAN जैसे statutory numbers उसी record में हैं जिसका payroll इस्तेमाल करता है, और उन्हें दिए गए laptops और phones भी।",
      );
      await r.scroll(320, 1100);
      await r.say(
        "When someone leaves, this is how you know exactly what to collect back.",
        "जब कोई कंपनी छोड़ता है, तो यहीं से पता चलता है कि उनसे क्या-क्या वापस लेना है।",
      );
      await r.wait(1000);
    },
  },

  "employee-status": {
    module: "employee-management",
    title: "Employment Status",
    description:
      "Keep each person’s status accurate: active, terminated or absconded, with the reason and date recorded, and PF, UAN and ESIC numbers alongside.",
    path: "/employee-management/priya.nair",
    async run(r) {
      const p = r.page;
      await r.chapter("Status at a Glance");
      await r.say(
        "Every employee has an employment status. Here, the green Active badge shows Priya is a current employee.",
        "हर employee का एक employment status होता है। यहाँ हरा Active badge बताता है कि Priya अभी कंपनी में हैं।",
      );
      await r.glide(560, 260, 900);
      await r.say(
        "Status decides who can sign in, who appears in payroll and who counts in headcount.",
        "Status तय करता है कि कौन sign in कर सकता है, कौन payroll में आता है और कौन headcount में गिना जाता है।",
      );
      await r.chapter("Edit Employment");
      await r.say(
        "HR changes it from Edit Employment. The same form holds the statutory numbers payroll needs.",
        "HR इसे Edit Employment से बदलता है। उसी form में वे statutory numbers भी हैं जिनकी payroll को ज़रूरत है।",
      );
      await r.click(p.getByRole("button", { name: "Edit Employment" }));
      await r.wait(1000);
      await r.say(
        "PF number, UAN and ESIC number are kept here, used for compliance filings.",
        "PF number, UAN और ESIC number यहीं रखे जाते हैं, compliance filings के लिए।",
      );
      await r.glide(720, 420, 900);
      await r.chapter("Changing Status");
      await r.say(
        "Employment Status can be Active, Terminated or Absconded.",
        "Employment Status Active, Terminated या Absconded हो सकता है।",
      );
      await choose(r, "Employment Status", "Terminated");
      await r.say(
        "Choosing Terminated asks for the reason and the date, so the record explains itself later.",
        "Terminated चुनने पर कारण और तारीख माँगी जाती है, ताकि बाद में record खुद सब बता दे।",
      );
      await r.wait(1200);
      await r.say(
        "Once saved, access ends immediately: they can no longer sign in or see any data.",
        "Save करते ही access तुरंत खत्म हो जाता है: वे न sign in कर सकते हैं, न कोई data देख सकते हैं।",
      );
      await r.say(
        "Every change is written to the audit log, with who made it and when. For now, we’ll cancel.",
        "हर बदलाव audit log में दर्ज होता है, किसने और कब किया, उसके साथ। अभी हम cancel कर देते हैं।",
      );
      await cancelDialog(r);
    },
  },

  kyc: {
    module: "employee-management",
    title: "Employee KYC",
    description:
      "Employees complete their own KYC in five guided steps; HR sees every status at a glance and reviews, approves or asks for changes.",
    path: "/kyc/view-employee-kycs",
    async run(r) {
      const p = r.page;
      await r.chapter("Why KYC");
      await r.say(
        "KYC collects what HR needs for every employee: identity documents, addresses, education and bank details for salary.",
        "KYC वह सब इकट्ठा करता है जो HR को हर employee के लिए चाहिए: identity documents, address, education और salary के लिए bank details।",
      );
      await r.chapter("Every Status");
      await r.say(
        "Employee KYC shows everyone’s status: approved, pending review, or sent back for revision.",
        "Employee KYC में सबका status दिखता है: approved, review के लिए pending, या revision के लिए वापस भेजा गया।",
      );
      await r.glide(1250, 330, 900);
      await r.say(
        "Filter to Pending to see exactly what is waiting for HR’s review.",
        "Pending पर filter करें और देखें कि HR के review के लिए क्या बाकी है।",
      );
      await r.click(p.getByRole("radio", { name: "Pending" }));
      await r.wait(1200);
      await r.say(
        "Revision Requested shows whose submission needs a fix, so nobody is left waiting.",
        "Revision Requested दिखाता है कि किसके जमा किए documents में सुधार चाहिए, ताकि कोई इंतज़ार में न रहे।",
      );
      await r.click(p.getByRole("radio", { name: "Revision Requested" }));
      await r.wait(1200);
      await r.click(p.getByRole("radio", { name: "All" }));
      await r.chapter("Complete My KYC");
      await r.say(
        "Employees fill in their own KYC. Complete My KYC walks them through it in five short steps.",
        "Employees अपना KYC खुद भरते हैं। Complete My KYC उन्हें पाँच छोटे steps में सब भरवाता है।",
      );
      await r.click(p.getByRole("button", { name: "Complete My KYC" }));
      await r.wait(1500);
      await r.say(
        "Personal details first, then address, identity documents like Aadhaar and PAN, and finally bank details.",
        "पहले personal details, फिर address, Aadhaar और PAN जैसे identity documents, और आखिर में bank details।",
      );
      await r.glide(330, 300, 900);
      await r.say(
        "A review step shows everything before it’s submitted, and HR approves it or asks for a change.",
        "Submit करने से पहले review step में सब दिखता है, फिर HR उसे approve करता है या बदलाव माँगता है।",
      );
      await r.say(
        "Sensitive numbers are stored encrypted, and are masked on screen unless someone with permission chooses to show them.",
        "Sensitive numbers encrypted रखे जाते हैं, और screen पर छिपे रहते हैं, जब तक अनुमति वाला कोई उन्हें दिखाना न चुने।",
      );
      await r.wait(800);
    },
  },

  assets: {
    module: "employee-management",
    title: "Company Assets",
    description:
      "Track laptops, phones and monitors: who has what, what’s free or in repair, returns, and issues reported by employees.",
    path: "/assets/inventory",
    async run(r) {
      const p = r.page;
      await r.chapter("Inventory");
      await r.say(
        "Assets tracks the company’s equipment: laptops, monitors, phones, and who has each one.",
        "Assets कंपनी के सामान का हिसाब रखता है: laptops, monitors, phones, और किसके पास क्या है।",
      );
      await r.say(
        "Each asset has a code, a category, the person it’s with and its status.",
        "हर asset का एक code, category, जिसके पास है उसका नाम और status होता है।",
      );
      await r.glide(900, 330, 900);
      await r.say(
        "Filter to Available to see what you can hand to a new joiner, or In Maintenance for what’s being repaired.",
        "Available पर filter करें और देखें कि नए joiner को क्या दे सकते हैं, या In Maintenance में क्या repair हो रहा है।",
      );
      await r.click(p.getByRole("radio", { name: "Available" }));
      await r.wait(1100);
      await r.click(p.getByRole("radio", { name: "All" }));
      await r.wait(500);
      await r.chapter("One Asset");
      await r.say(
        "Open an asset to see its details. When someone hands it back, record the return here.",
        "किसी asset को खोलकर उसकी details देखें। जब कोई उसे वापस करे, तो return यहीं दर्ज करें।",
      );
      await r.click(
        main(p)
          .getByText(/MacBook Pro/)
          .first(),
      );
      await r.wait(1300);
      await r.optional("return", () =>
        r.point(p.getByRole("button", { name: "Return" })),
      );
      await r.optional("close", () =>
        r.click(p.getByRole("button", { name: "Close" })),
      );
      await r.chapter("Add an Asset");
      await r.say(
        "Add new equipment with a name, an asset code and a category, plus its purchase date and value if you track them.",
        "नया सामान name, asset code और category के साथ जोड़ें, साथ में purchase date और value अगर आप उनका हिसाब रखते हैं।",
      );
      await r.click(p.getByRole("button", { name: "Add Asset" }));
      await r.wait(900);
      await r.type(
        p.getByRole("textbox", { name: "Name" }),
        "MacBook Air 13″",
        60,
      );
      await r.type(
        p.getByRole("textbox", { name: "Asset Code" }),
        "LAP-0057",
        70,
      );
      await cancelDialog(r);
      await r.chapter("Issues");
      await r.say(
        "When something breaks, employees report it under Issues, and the right people can track it to a fix.",
        "जब कुछ खराब हो, employees उसे Issues में report करते हैं, और सही लोग उसे ठीक होने तक track करते हैं।",
      );
      await nav(r, "Assets", "Issues");
      await r.click(p.getByRole("button", { name: "Report an Issue" }));
      await r.wait(900);
      await r.say(
        "They choose the asset, the type of problem and its priority, and describe what happened.",
        "वे asset, समस्या का type और priority चुनते हैं, और बताते हैं कि क्या हुआ।",
      );
      await r.type(
        p.getByRole("textbox", { name: "Title" }),
        "Battery drains in two hours",
        55,
      );
      await r.wait(800);
      await cancelDialog(r);
    },
  },

  resignations: {
    module: "employee-management",
    title: "Resignations and Exit",
    description:
      "Employees resign inside Praesto, managers and HR approve, and your exit policy sets notice periods, checklists and exit interviews.",
    path: "/resignation-process/view-resignations",
    async run(r) {
      const p = r.page;
      await r.chapter("Resignations");
      await r.say(
        "When someone leaves, Praesto handles it as a clear process instead of an email thread.",
        "जब कोई कंपनी छोड़ता है, Praesto इसे email thread की जगह एक साफ़ process की तरह संभालता है।",
      );
      await r.say(
        "Resignations lists every one with its date, the last working day and its status.",
        "Resignations में हर resignation उसकी तारीख, last working day और status के साथ दिखता है।",
      );
      await r.glide(900, 260, 900);
      await r.click(p.getByRole("radio", { name: "Approved" }));
      await r.wait(1000);
      await r.click(p.getByRole("radio", { name: "All" }));
      await r.chapter("Submitting");
      await r.say(
        "An employee resigns with Submit Resignation and a short reason. Their manager and HR are notified.",
        "Employee Submit Resignation और एक छोटे कारण के साथ resign करता है। उनके manager और HR को सूचना मिलती है।",
      );
      await r.click(p.getByRole("button", { name: /Submit Resignation/ }));
      await r.wait(900);
      await r.type(
        p.getByRole("textbox", { name: "Reason" }),
        "Relocating to Pune for family reasons.",
        45,
      );
      await r.say(
        "The last working day is worked out from the notice period that applies to them.",
        "Last working day उन पर लागू notice period से अपने आप तय होता है।",
      );
      await cancelDialog(r);
      await r.chapter("Exit Policy");
      await r.say(
        "HR sets the rules once in Exit Policy. Notice periods can depend on role and how long someone has been with you.",
        "HR ये rules एक बार Exit Policy में तय करता है। Notice period role और कंपनी में बिताए समय पर निर्भर हो सकता है।",
      );
      await r.navigate("/settings/exit-policy");
      await r.glide(560, 300, 900);
      await r.say(
        "The Exit Checklist lists what must be done before someone leaves, like returning assets and handing over work.",
        "Exit Checklist में वो काम हैं जो किसी के जाने से पहले होने चाहिए, जैसे assets लौटाना और काम सौंपना।",
      );
      await r.optional("checklist", () =>
        r.click(
          p
            .getByRole("radio", { name: /Exit Checklist/ })
            .or(p.getByRole("tab", { name: /Exit Checklist/ })),
        ),
      );
      await r.wait(1200);
      await r.say(
        "And Exit Interview sets the questions you ask, so you learn why people leave.",
        "और Exit Interview में आपके सवाल तय होते हैं, ताकि आप जान सकें कि लोग क्यों जाते हैं।",
      );
      await r.optional("interview", () =>
        r.click(
          p
            .getByRole("radio", { name: /Exit Interview/ })
            .or(p.getByRole("tab", { name: /Exit Interview/ })),
        ),
      );
      await r.wait(1200);
    },
  },

  // ── Attendance ───────────────────────────────────────────────────────────
  "my-attendance": {
    module: "attendance",
    title: "Attendance at a Glance",
    description:
      "An employee’s whole month: present days, leave, corrections left, a colour-coded calendar and a daily record of punches and hours.",
    path: "/attendance",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "My Attendance answers every question an employee has about their month, without asking HR.",
        "My Attendance employee के महीने के हर सवाल का जवाब देता है, HR से पूछे बिना।",
      );
      await r.chapter("Monthly Summary");
      await r.say(
        "At the top: present days, half days, paid leave and any loss of pay this month.",
        "ऊपर: इस महीने के present days, half days, paid leave और loss of pay।",
      );
      await r.glide(420, 230, 800);
      await r.glide(1150, 230, 1300);
      await r.say(
        "Corrections Left shows how many fixes you can still request this month, under your company’s policy.",
        "Corrections Left बताता है कि कंपनी की policy के हिसाब से इस महीने आप और कितने सुधार माँग सकते हैं।",
      );
      await r.glide(1330, 230, 700);
      await r.chapter("Calendar");
      await r.say(
        "The calendar colours every day: present, late or half day, on leave, a holiday or a week off.",
        "Calendar हर दिन को रंग देता है: present, late या half day, leave, holiday या week off।",
      );
      await r.glide(560, 430, 900);
      await r.say(
        "A day that looks wrong stands out immediately, long before payroll runs.",
        "कोई गलत दिखने वाला दिन तुरंत नज़र आ जाता है, payroll चलने से बहुत पहले।",
      );
      await r.chapter("Daily Record");
      await r.say(
        "The daily record lists each punch-in and punch-out time, the hours worked and the day’s status.",
        "Daily record में हर punch-in और punch-out का समय, काम के घंटे और दिन का status दर्ज है।",
      );
      await r.scroll(380, 1200);
      await r.wait(1200);
      await r.chapter("Previous Months");
      await r.say(
        "Step back to any earlier month to check what was recorded.",
        "किसी भी पिछले महीने पर जाकर देखें कि क्या दर्ज हुआ था।",
      );
      await r.scroll(-380, 900);
      await r.click(p.getByRole("button", { name: "Previous month" }));
      await r.wait(1500);
    },
  },

  "attendance-correction": {
    module: "attendance",
    title: "Correcting Attendance",
    description:
      "HR fixes a missed or wrong punch for an employee, with the change previewed and counted against the monthly correction allowance.",
    path: "/attendance/attendance-correction",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "People forget to punch out, or a phone dies at the wrong moment. Attendance Corrections fixes the record properly.",
        "लोग punch out करना भूल जाते हैं, या phone गलत समय पर बंद हो जाता है। Attendance Corrections record को ठीक से सुधारता है।",
      );
      await r.chapter("Choose the Employee");
      await r.say(
        "Find the employee whose attendance needs fixing.",
        "उस employee को चुनें जिसकी attendance ठीक करनी है।",
      );
      await r.type(p.getByRole("combobox", { name: "Employee" }), "Rohan", 120);
      await r.wait(900);
      await r.click(p.getByRole("option", { name: /Rohan Gupta/ }));
      await r.wait(1000);
      await r.chapter("The Rules");
      await r.say(
        "Each correction counts toward the employee’s monthly allowance, which your attendance policy sets.",
        "हर correction employee की monthly limit में गिना जाता है, जो आपकी attendance policy तय करती है।",
      );
      await r.glide(1180, 280, 900);
      await r.say(
        "That keeps corrections for genuine mistakes, not a way around punching in.",
        "इससे corrections सिर्फ़ असली गलतियों के लिए रहते हैं, punch in से बचने का तरीका नहीं।",
      );
      await r.chapter("Corrected Times");
      await r.say(
        "Pick the day, then enter the times they actually started and finished.",
        "दिन चुनें, फिर वह समय डालें जब उन्होंने वास्तव में काम शुरू और खत्म किया।",
      );
      await pickDate(
        r,
        p.getByRole("button", { name: "Date and Time", exact: true }),
        weekday(-3),
      );
      await r.point(p.getByRole("button", { name: "Time" }).first());
      await r.chapter("Preview and Save");
      await r.say(
        "The summary previews the change, so you can check it before saving.",
        "Summary बदलाव पहले से दिखा देती है, ताकि आप save करने से पहले जाँच सकें।",
      );
      await r.glide(1180, 520, 900);
      await r.say(
        "Saving updates their attendance and hours, and the change is written to the audit log.",
        "Save करने से उनकी attendance और घंटे update होते हैं, और बदलाव audit log में दर्ज होता है।",
      );
      await r.point(p.getByRole("button", { name: "Save Correction" }));
      await r.wait(800);
    },
  },

  geofencing: {
    module: "attendance",
    title: "Attendance Rules and Geofencing",
    description:
      "Set the working day, grace period and correction window, then turn on Geofencing and place the office on a map so punches only count nearby.",
    path: "/settings/attendance",
    async run(r) {
      const p = r.page;
      await r.chapter("Working Day");
      await r.say(
        "Attendance Rules set how attendance works for the whole organisation, in one place.",
        "Attendance Rules पूरे organisation के लिए attendance के नियम एक जगह तय करते हैं।",
      );
      await r.say(
        "Set when the workday starts, and how many minutes late still counts as on time.",
        "Workday कब शुरू होता है, और कितने मिनट की देरी भी समय पर गिनी जाए, यह तय करें।",
      );
      await r.glide(1100, 260, 900);
      await r.say(
        "Full day and half day hours decide how each day is marked, and the corrections window limits how far back fixes can go.",
        "Full day और half day के घंटे तय करते हैं कि हर दिन कैसे marked हो, और corrections window बताती है कि कितने पीछे तक सुधार हो सकता है।",
      );
      await r.glide(1100, 420, 1000);
      await r.chapter("Geofencing");
      await r.say(
        "Geofencing makes sure punches from the office really are from the office.",
        "Geofencing पक्का करता है कि office से हुए punches सच में office से ही हों।",
      );
      const geo = p.getByRole("switch", { name: "Geofencing" });
      await r.scroll(420, 1000);
      if (!(await geo.isChecked())) await r.click(geo);
      await r.wait(800);
      await r.scroll(360, 1000);
      await r.chapter("Office Location");
      await r.say(
        "Search for the office address, or drop a pin on the map.",
        "Office का address search करें, या map पर pin लगाएँ।",
      );
      await r.type(
        p.getByPlaceholder("Search a place, or paste a Google Maps link"),
        "MG Road, Bengaluru",
        80,
      );
      await r.wait(1600);
      await r.optional("pick place", async () => {
        const hit = p.getByRole("option").first();
        await hit.waitFor({ timeout: 4000 });
        await r.click(hit);
        await r.wait(2000);
      });
      await r.chapter("Radius");
      await r.say(
        "The radius sets how far from the office a punch is allowed, from fifty metres up.",
        "Radius तय करता है कि office से कितनी दूरी तक punch की अनुमति है, पचास मीटर से शुरू।",
      );
      await r.point(p.getByLabel("Radius"));
      await r.say(
        "Employees outside the circle can’t punch in from the office, though approved work from home still works.",
        "घेरे से बाहर वाले employees office से punch in नहीं कर सकते, हालाँकि approved work from home चलता रहता है।",
      );
      await r.say(
        "Nothing changes until you save, so you can adjust everything first.",
        "Save करने तक कुछ नहीं बदलता, तो आप पहले सब ठीक कर सकते हैं।",
      );
      await r.wait(800);
    },
  },

  wfh: {
    module: "attendance",
    title: "Work From Home",
    description:
      "Employees request work-from-home days, managers approve in one click, and approved days count correctly in attendance.",
    path: "/wfh/requests",
    async run(r) {
      const p = r.page;
      await r.chapter("Requests");
      await r.say(
        "Work From Home keeps remote days official, so attendance is right and nobody wonders where someone is.",
        "Work From Home remote दिनों को official रखता है, ताकि attendance सही रहे और किसी को सोचना न पड़े कि कोई कहाँ है।",
      );
      await r.say(
        "Your requests and your team’s are in one place, with the dates, the reason and the status.",
        "आपकी और आपकी team की requests एक जगह हैं, तारीख़ों, कारण और status के साथ।",
      );
      await r.glide(900, 330, 900);
      await r.chapter("Approve");
      await r.say(
        "Managers approve or reject each request right from the list.",
        "Managers हर request को list से ही approve या reject करते हैं।",
      );
      await r.click(p.getByRole("button", { name: "Approve" }).first());
      await r.wait(1000);
      await r.optional("confirm", async () => {
        const c = p
          .getByRole("dialog")
          .getByRole("button", { name: /Approve/ });
        if (await c.count()) await r.click(c);
      });
      await r.wait(800);
      await r.say(
        "Approved days count as worked from home, not absent, and geofencing doesn’t apply to them.",
        "Approved दिन absent नहीं, work from home गिने जाते हैं, और उन पर geofencing लागू नहीं होता।",
      );
      await r.chapter("Request a Day");
      await r.say(
        "To ask for a day, choose Request WFH, pick the dates and give a short reason.",
        "Day माँगने के लिए Request WFH चुनें, तारीख़ें चुनें और छोटा कारण लिखें।",
      );
      await r.click(p.getByRole("button", { name: "Request WFH" }));
      await r.wait(900);
      await pickDate(r, p.getByRole("button", { name: "From" }), weekday(6));
      await r.type(
        p.getByRole("textbox", { name: "Reason" }),
        "Internet installation at home",
        50,
      );
      await r.say(
        "It goes straight to your approver, and you’re notified when they decide.",
        "यह सीधे आपके approver के पास जाती है, और फ़ैसला होते ही आपको सूचना मिलती है।",
      );
      await r.click(
        p.getByRole("dialog").getByRole("button", { name: "Submit Request" }),
      );
      await r.wait(1500);
    },
  },

  holidays: {
    module: "attendance",
    title: "Holidays",
    description:
      "The year’s holidays by month, how many are left and when the next one is, shown on everyone’s calendar and counted in attendance.",
    path: "/holidays",
    async run(r) {
      const p = r.page;
      await r.chapter("The Year");
      await r.say(
        "Holidays shows every day the whole organisation is off this year, laid out by month.",
        "Holidays में इस साल के वे सभी दिन हैं जब पूरा organisation बंद रहता है, महीने के हिसाब से।",
      );
      await r.glide(900, 520, 1000);
      await r.chapter("At a Glance");
      await r.say(
        "At the top, the total for the year, how many are still to come, and when the next holiday is.",
        "ऊपर, साल की कुल holidays, कितनी अभी बाकी हैं, और अगली holiday कब है।",
      );
      await r.glide(560, 250, 800);
      await r.glide(1220, 250, 1100);
      await r.chapter("Everywhere at Once");
      await r.say(
        "Holidays appear on everyone’s calendar automatically, and attendance treats them as days off, not absences.",
        "Holidays अपने आप सबके calendar पर आ जाती हैं, और attendance उन्हें absent नहीं, छुट्टी मानती है।",
      );
      await r.scroll(300, 1000);
      await r.say(
        "A holiday on a weekend is marked, so people know it doesn’t give an extra day.",
        "Weekend पर पड़ने वाली holiday marked रहती है, ताकि लोगों को पता हो कि इससे extra छुट्टी नहीं मिलती।",
      );
      await r.wait(1000);
      await r.chapter("Other Years");
      await r.say(
        "Look back at last year, or plan ahead for next year, with the arrows.",
        "Arrows से पिछला साल देखें, या अगले साल की योजना बनाएँ।",
      );
      await r.scroll(-300, 800);
      await r.click(p.getByRole("button", { name: "Next year" }));
      await r.wait(1200);
      await r.click(p.getByRole("button", { name: "Previous year" }));
      await r.wait(800);
    },
  },
};
