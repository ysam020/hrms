// "Praesto: The Complete Tour" — one film of the whole product, for YouTube
// and for anyone who wants the full demo in one sitting. film.mjs renders it.
//
// Scenes play in order, joined by short transitions:
//   card  an animated title or info screen (cards.mjs), with narration
//   card  …or, between two topics of a part, a short "next topic" screen
//   clip  part of a recorded demo, from one chapter up to another (or its
//         end); its own narration and subtitles come with it
//
// Every line is [English, Hindi]. A third and fourth item, when present, are
// what the narrator says instead (for "praesto.in" and numbers in Hindi).
// The claims here are the ones the product makes on its landing page and in
// the demos themselves: nothing is promised that isn't on screen.

export const FILM = {
  id: "praesto-tour",
  title: "Praesto: The Complete Tour",
  description:
    "Every part of Praesto in one film: setting up, the screens everyone uses, employees, attendance, leave, payroll, recruitment, performance, the workplace, reports, security and AI.",
};

/** Section scenes: one per module, with the recorded parts that follow it. */
const SECTIONS = [
  {
    module: "getting-started",
    line: [
      "First, getting started: setting up your organisation, bringing people in, and signing in without a password.",
      "सबसे पहले, शुरुआत: अपना organisation set up करना, लोगों को जोड़ना, और बिना password के sign in करना।",
    ],
    clips: [
      ["org-setup", "Your Organisation", "Contact Details"],
      ["join-requests", "Review"],
      ["passkeys", "Add a Passkey"],
    ],
  },
  {
    module: "overview",
    line: [
      "Next, the screens everyone uses every day: Today, the calendar, team chat and the organisation chart.",
      "आगे, वे screens जो हर कोई रोज़ इस्तेमाल करता है: Today, calendar, team chat और organisation chart।",
    ],
    clips: [
      ["today-at-a-glance", "Your Day", "Make It Yours"],
      ["chat", "Pinned Messages"],
      ["organization-structure", "Headcount", "Not on a Team"],
    ],
  },
  {
    module: "employee-management",
    line: [
      "Employees: one directory for everyone, with employment status, KYC, company assets and resignations.",
      "Employees: सबके लिए एक directory, employment status, KYC, company assets और resignations के साथ।",
    ],
    clips: [
      ["employee-directory", "Search", "Statutory and Assets"],
      ["employee-status", "Changing Status"],
      ["kyc", "Every Status", "Complete My KYC"],
    ],
  },
  {
    module: "attendance",
    line: [
      "Attendance: punches and hours, corrections, Geofencing around the office, work from home and holidays.",
      "Attendance: punches और घंटे, corrections, office के आसपास Geofencing, work from home और holidays।",
    ],
    clips: [
      ["my-attendance", "Monthly Summary", "Daily Record"],
      ["attendance-correction", "Corrected Times"],
      ["geofencing", "Office Location"],
      ["wfh", "Approve", "Request a Day"],
    ],
  },
  {
    module: "leave-management",
    line: [
      "Leave: apply in seconds, approve in one click, and set the leave policy your organisation runs on.",
      "Leave: seconds में apply करें, एक click में approve करें, और अपने organisation की leave policy तय करें।",
    ],
    clips: [
      ["apply-leave", "Dates"],
      ["approve-leave", "Several at Once"],
      ["leave-policy", "Statutory Entitlement", "Your Own Leave Types"],
    ],
  },
  {
    module: "payroll",
    line: [
      "Payroll: each month from draft to approved to disbursed, with salary structures, and payslips for everyone.",
      "Payroll: हर महीना draft से approved और disbursed तक, salary structures के साथ, और सबके लिए payslips।",
    ],
    clips: [
      ["payroll-runs", "Latest Run", "New Run"],
      ["payslips", "Latest Payslip", "History"],
      ["payroll-setup", "Salary Components", "Salary Management"],
    ],
  },
  {
    module: "recruitment",
    line: [
      "Recruitment: openings, interviews, offers and insights, from the first application to the first day.",
      "Recruitment: openings, interviews, offers और insights, पहली application से पहले दिन तक।",
    ],
    clips: [
      ["hiring-pipeline", "Job Openings", "One Role"],
      ["new-job-opening", "Review and Publish"],
      ["interview-scheduling", "Schedule a Round", "Reschedule"],
      ["hire-or-reject", "Hire", "Hired and Rejected"],
      ["recruitment-insights", "At a Glance", "Worth Your Attention"],
    ],
  },
  {
    module: "performance",
    line: [
      "Performance: review cycles with a self-assessment first, and the manager’s review after.",
      "Performance: review cycles, जिनमें पहले self-assessment और फिर manager का review होता है।",
    ],
    clips: [["performance-reviews", "Review Cycles"]],
  },
  {
    module: "workplace",
    line: [
      "The workplace: announcements, policies, the helpdesk and notifications, so everyone stays informed.",
      "Workplace: announcements, policies, helpdesk और notifications, ताकि सबको हर जानकारी रहे।",
    ],
    clips: [
      ["announcements", "Company News", "Past Announcements"],
      ["helpdesk", "A Conversation"],
      ["notifications", "Push Notifications"],
    ],
  },
  {
    module: "reports",
    line: [
      "Reports and analytics: build your own reports from people data, and see the workforce at a glance.",
      "Reports और analytics: people data से अपनी reports खुद बनाएँ, और workforce को एक नज़र में देखें।",
    ],
    clips: [
      ["report-builder", "Choose the Data"],
      ["analytics", "Workforce", "Leave and Attendance"],
    ],
  },
  {
    module: "security",
    line: [
      "Security and admin: role-based access, a tamper-proof audit log, organisation settings and your subscription.",
      "Security और admin: role-based access, tamper-proof audit log, organisation settings और आपका subscription।",
    ],
    clips: [
      ["roles-permissions", "Own, Team, Everyone", "User Permissions"],
      ["audit-logs", "Before and After"],
      ["settings", "Work Week", "Saving Changes"],
    ],
  },
  {
    module: "ai-support",
    line: [
      "And finally, AI and support: use your own AI assistant with Praesto, and reach our team when you need help.",
      "और आखिर में, AI और support: Praesto के साथ अपना AI assistant इस्तेमाल करें, और ज़रूरत पड़ने पर हमारी team तक पहुँचें।",
    ],
    clips: [
      ["ai-assistants", "Your Own Assistant"],
      ["support", "Support Tickets", "Raising a Ticket"],
    ],
  },
];

export const SCENES = [
  {
    kind: "card",
    card: "open",
    chapter: "Introduction",
    lead: 2.2,
    lines: [
      [
        "This is Praesto. People operations, beautifully connected.",
        "यह है Praesto. People operations, एक साथ, खूबसूरती से जुड़े हुए।",
      ],
    ],
  },
  {
    kind: "card",
    card: "pitch",
    lines: [
      [
        "Attendance, leave, payroll, hiring, reviews and the helpdesk: most companies run each of them somewhere different.",
        "Attendance, leave, payroll, hiring, reviews और helpdesk: ज़्यादातर companies इनमें से हर एक को अलग जगह चलाती हैं।",
      ],
      [
        "Praesto brings them together in one workspace, set up to your organisation’s rules, with access that fits each person’s role.",
        "Praesto इन सबको एक workspace में लाता है, आपके organisation के नियमों के हिसाब से, और हर व्यक्ति के role के मुताबिक access के साथ।",
      ],
    ],
  },
  {
    kind: "card",
    card: "agenda",
    lines: [
      [
        "Over the next few minutes, we’ll walk through every part of it, with Halcyon Labs, a fictional company, and its people.",
        "अगले कुछ मिनटों में हम इसका हर हिस्सा देखेंगे, Halcyon Labs नाम की एक काल्पनिक company और उसके लोगों के साथ।",
      ],
    ],
  },
  ...SECTIONS.flatMap((s, i) => [
    {
      kind: "card",
      card: "section",
      module: s.module,
      index: i + 1,
      of: SECTIONS.length,
      chapter: null, // the module's title (cards.mjs)
      lines: [s.line],
      highlights: s.clips.map(([id]) => id),
    },
    // Between one topic and the next, a short screen names what's coming
    // and where it sits in the part, so the move is never a surprise.
    ...s.clips.flatMap(([video, from, to], k) => [
      ...(k > 0
        ? [
            {
              kind: "card",
              card: "topic",
              module: s.module,
              part: i + 1,
              parts: SECTIONS.length,
              video,
              step: k + 1,
              topics: s.clips.map(([id]) => id),
              lines: [],
              hold: 3.6,
            },
          ]
        : []),
      { kind: "clip", module: s.module, video, from, to: to ?? null },
    ]),
  ]),
  {
    kind: "card",
    card: "outro",
    chapter: "Try Praesto",
    lines: [
      [
        "That’s Praesto: everything your people need, in one place.",
        "यह है Praesto: आपके लोगों की हर ज़रूरत, एक जगह।",
      ],
      [
        "Start your 14-day free trial at praesto.in, or watch any part of this tour again on our demos page.",
        "praesto.in पर अपना 14-day free trial शुरू करें, या इस tour का कोई भी हिस्सा हमारे demos page पर फिर से देखें।",
        "Start your fourteen-day free trial at Praysto dot in, or watch any part of this tour again on our demos page.",
        "प्रेस्टो डॉट इन पर अपना फ़ोर्टीन-डे फ़्री ट्रायल शुरू करें, या इस टूर का कोई भी हिस्सा हमारे डेमोज़ पेज पर फिर से देखें।",
      ],
    ],
  },
  { kind: "card", card: "end", lines: [], hold: 4 },
];
