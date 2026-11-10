// Getting Started and Platform Overview demos.
import { ONBOARDING } from "../extras.mjs";
import {
  cancelDialog,
  choose,
  main,
  nav,
  pickDate,
  weekday,
} from "./common.mjs";

const createPhase = {};

export const START_FLOWS = {
  // ── Getting started ──────────────────────────────────────────────────────
  "org-setup": {
    module: "getting-started",
    title: "Setting Up Your Organisation",
    description:
      "Create your company’s workspace in a few minutes: name it, choose your working days, start a 14-day free trial and add the contact details employees will see.",
    path: "/org-setup",
    extra: ONBOARDING("create", createPhase),
    async run(r) {
      const p = r.page;
      await r.chapter("Getting Started");
      await r.say(
        "Getting started with Praesto takes a few minutes. You sign in with your Google account, and there’s no password to create.",
        "Praesto शुरू करने में बस कुछ मिनट लगते हैं। आप अपने Google account से sign in करते हैं, कोई password नहीं बनाना पड़ता।",
      );
      await r.say(
        "If your company isn’t on Praesto yet, you’re taken straight to setting up its workspace.",
        "अगर आपकी कंपनी अभी Praesto पर नहीं है, तो आप सीधे उसका workspace बनाने पहुँच जाते हैं।",
      );
      await r.chapter("Your Organisation");
      await r.say(
        "Start with your organisation’s name. This is what your employees will see when they sign in.",
        "सबसे पहले अपने organisation का नाम लिखें। Sign in करने पर आपके employees यही नाम देखेंगे।",
      );
      await r.type(
        p.getByRole("textbox", { name: "Organisation Name" }),
        "Northwind Studio",
        70,
      );
      await r.say(
        "Company size decides your plan, so you only pay for the size you are.",
        "Company size से आपका plan तय होता है, ताकि आप उतना ही दें जितनी बड़ी आपकी कंपनी है।",
      );
      await choose(r, /Company Size/, "26–100 employees");
      await r.say(
        "Then mark your working days. Praesto uses them for attendance and leave from day one, and you can change them later.",
        "फिर अपने working days चुनें। Praesto पहले दिन से attendance और leave के लिए इन्हीं का इस्तेमाल करता है, और आप इन्हें बाद में बदल सकते हैं।",
      );
      await r.click(p.getByRole("button", { name: "Saturday" }));
      await r.wait(900);
      await r.click(p.getByRole("button", { name: "Saturday" }));
      await r.wait(500);
      await r.click(p.getByRole("button", { name: "Continue" }));
      await r.wait(1200);
      await r.chapter("Free Trial");
      await r.say(
        "Every new organisation can use Praesto free for 14 days, with every feature switched on.",
        "हर नया organisation 14 दिन तक Praesto मुफ़्त इस्तेमाल कर सकता है, सभी features के साथ।",
      );
      await r.point(p.getByRole("button", { name: /Start 14-Day Free Trial/ }));
      await r.say(
        "Your card is verified securely, and nothing is charged until the trial ends. You can cancel any time before that.",
        "आपका card सुरक्षित तरीके से verify होता है, और trial खत्म होने तक कुछ charge नहीं होता। उससे पहले कभी भी cancel कर सकते हैं।",
      );
      await r.say(
        "If you’d rather not wait, you can skip the trial and pay for your plan straight away.",
        "अगर आप इंतज़ार नहीं करना चाहते, तो trial छोड़कर सीधे अपने plan का भुगतान कर सकते हैं।",
      );
      await r.point(p.getByRole("button", { name: /Skip the Trial/ }));
      await r.wait(800);
      // The trial has started: the session continues at the last step.
      createPhase.profile = true;
      await r.page.goto(r.page.url().replace(/\/org-setup.*$/, "/dashboard"));
      await r.page
        .getByRole("heading", { name: "Organisation Profile" })
        .waitFor({ timeout: 8000 });
      await r.chapter("Contact Details");
      await r.say(
        "Last, add the contact details your employees will see when they need help: a phone number and an email for HR.",
        "आखिर में वो contact details डालें जो employees को मदद चाहिए होने पर दिखेंगे: HR का phone number और email।",
      );
      await r.type(
        p.getByRole("textbox", { name: /Help Phone/ }),
        "+91 80 4000 1234",
        45,
      );
      await r.type(
        p.getByRole("textbox", { name: /Help Email/ }),
        "people@northwind.example",
        40,
      );
      await r.say(
        "Your office address and website complete the profile. Each field is optional, and you can fill them in later from Settings.",
        "Office address और website से profile पूरी होती है। हर field optional है, और आप इन्हें बाद में Settings से भर सकते हैं।",
      );
      await r.type(
        p.getByRole("textbox", { name: /Office Address/ }),
        "2nd Floor, 88 MG Road, Bengaluru",
        35,
      );
      await r.point(p.getByRole("button", { name: "Save and Continue" }));
      await r.say(
        "That’s it. Your workspace is ready, and as its owner you decide who joins and what each person can see.",
        "बस इतना ही। आपका workspace तैयार है, और owner के तौर पर आप तय करते हैं कि कौन जुड़ेगा और कौन क्या देख सकता है।",
      );
    },
  },

  "join-organisation": {
    module: "getting-started",
    title: "Joining Your Company’s Workspace",
    description:
      "When your company already uses Praesto: sign in with your work account, ask to join, and get in as soon as an admin approves.",
    path: "/org-setup",
    extra: ONBOARDING("join"),
    async run(r) {
      const p = r.page;
      await r.chapter("Sign In");
      await r.say(
        "When your company already uses Praesto, there’s nothing to set up. You simply sign in with your work Google account.",
        "अगर आपकी कंपनी पहले से Praesto इस्तेमाल करती है, तो कुछ set up नहीं करना। बस अपने work Google account से sign in करें।",
      );
      await r.chapter("Your Company");
      await r.say(
        "Praesto recognises your company from your email address and offers to add you to its workspace.",
        "Praesto आपके email address से आपकी कंपनी पहचान लेता है और आपको उसके workspace में जोड़ने का विकल्प देता है।",
      );
      await r.glide(720, 330, 900);
      await r.say(
        "The company’s name is shown, so you can be sure you’re joining the right one.",
        "कंपनी का नाम दिखता है, ताकि आपको भरोसा रहे कि आप सही जगह जुड़ रहे हैं।",
      );
      await r.chapter("Request to Join");
      await r.say(
        "Choose Request to Join. Your name and email go to the organisation’s admins for approval.",
        "Request to Join चुनें। आपका नाम और email approval के लिए organisation के admins के पास जाता है।",
      );
      await r.click(p.getByRole("button", { name: "Request to Join" }));
      await r.wait(1200);
      await r.chapter("Waiting for Approval");
      await r.say(
        "Nobody gets into your company’s data without an admin saying yes. Until then, your request shows as pending.",
        "Admin की मंज़ूरी के बिना कोई भी आपकी कंपनी का data नहीं देख सकता। तब तक आपकी request pending दिखती है।",
      );
      await r.say(
        "Check again whenever you like. As soon as an admin approves, you’re taken straight into the workspace.",
        "जब चाहें दोबारा check करें। Admin के approve करते ही आप सीधे workspace में पहुँच जाते हैं।",
      );
      await r.point(p.getByRole("button", { name: "Check Again" }));
      await r.wait(1500);
    },
  },

  "join-requests": {
    module: "getting-started",
    title: "Approving People Who Ask to Join",
    description:
      "Admins see everyone who has asked to join the organisation, check who they are, and approve or decline each request.",
    path: "/settings/join-requests",
    async run(r) {
      const p = r.page;
      await r.chapter("Join Requests");
      await r.say(
        "New employees don’t need an invitation link. They sign in and ask to join, and their requests land here, in Join Requests.",
        "नए employees को invitation link की ज़रूरत नहीं। वे sign in करके जुड़ने का अनुरोध करते हैं, और उनकी requests यहाँ, Join Requests में आती हैं।",
      );
      await r.say(
        "Each request shows the person’s name, the email they signed in with, and when they asked.",
        "हर request में व्यक्ति का नाम, जिस email से उन्होंने sign in किया, और अनुरोध का समय दिखता है।",
      );
      await r.glide(560, 250, 900);
      await r.wait(800);
      await r.chapter("Review");
      await r.say(
        "Because the email comes from Google, you can see exactly who is asking before you let anyone in.",
        "क्योंकि email Google से आता है, आप किसी को अंदर आने देने से पहले ठीक-ठीक देख सकते हैं कि कौन अनुरोध कर रहा है।",
      );
      await r.glide(900, 250, 800);
      await r.say(
        "Reject a request that you don’t recognise. The person is told, and they can’t see anything inside.",
        "जिस request को आप नहीं पहचानते, उसे Reject करें। व्यक्ति को बता दिया जाता है, और वे अंदर कुछ नहीं देख सकते।",
      );
      await r.point(p.getByRole("button", { name: "Reject" }).first());
      await r.chapter("Approve");
      await r.say(
        "Approve, and they become an employee straight away, with the default employee role and permissions.",
        "Approve करें, और वे तुरंत employee बन जाते हैं, default employee role और permissions के साथ।",
      );
      await r.click(p.getByRole("button", { name: "Approve" }).first());
      await r.wait(1200);
      await r.optional("confirm", async () => {
        const confirm = p
          .getByRole("dialog")
          .getByRole("button", { name: /Approve/ });
        if (await confirm.count()) await r.click(confirm);
      });
      await r.say(
        "From here, give them a team, a manager or a different role whenever you need to.",
        "इसके बाद, जब भी ज़रूरत हो, उन्हें team, manager या कोई दूसरा role दें।",
      );
      await r.wait(1200);
    },
  },

  "profile-and-theme": {
    module: "getting-started",
    title: "Your Profile, Status and Theme",
    description:
      "Your own record in one place, a status so colleagues know if you’re free, the devices that get notifications, and light or dark mode.",
    path: "/profile",
    async run(r) {
      const p = r.page;
      await r.chapter("My Profile");
      await r.say(
        "My Profile is your own record in Praesto: your work details, contact information, personal details and statutory numbers.",
        "My Profile Praesto में आपका अपना record है: work details, contact जानकारी, personal details और statutory numbers।",
      );
      await r.glide(560, 420, 900);
      await r.say(
        "Most of it comes from your KYC, so it stays accurate without you typing it twice.",
        "इसका ज़्यादातर हिस्सा आपके KYC से आता है, ताकि बिना दोबारा टाइप किए सब सही रहे।",
      );
      await r.scroll(260, 900);
      await r.optional("update kyc", () =>
        r.point(p.getByRole("link", { name: "Update KYC" })),
      );
      await r.scroll(-260, 700);
      await r.chapter("Your Status");
      await r.say(
        "Set a status so colleagues know whether you’re free: busy, in a meeting, focusing, or away.",
        "Status set करें ताकि साथियों को पता रहे कि आप free हैं या नहीं: busy, meeting में, focus कर रहे हैं, या away।",
      );
      await r.click(p.getByRole("button", { name: /Change$/ }).first());
      await r.wait(900);
      await r.click(p.getByRole("radio", { name: "In a Meeting" }));
      await r.say(
        "Add a short message if you like, and choose when the status clears by itself.",
        "चाहें तो एक छोटा message जोड़ें, और चुनें कि status अपने आप कब हट जाए।",
      );
      await r.type(
        p.getByRole("textbox", { name: /Message/ }),
        "Back at 3 pm",
        60,
      );
      await r.click(
        p.getByRole("dialog").getByRole("button", { name: "Save" }),
      );
      await r.wait(1000);
      await r.chapter("Notifications");
      await r.say(
        "The Notifications tab lists the devices that receive push notifications, so you can see where alerts go.",
        "Notifications tab में वे devices हैं जिन पर push notifications आते हैं, ताकि आप देख सकें कि alerts कहाँ जाते हैं।",
      );
      await r.click(p.getByRole("tab", { name: "Notifications" }));
      await r.wait(1500);
      await r.chapter("Light and Dark");
      await r.say(
        "Praesto has a light and a dark theme. Open the menu under your organisation’s name.",
        "Praesto में light और dark theme है। अपने organisation के नाम के नीचे वाला menu खोलें।",
      );
      await r.click(p.getByRole("button", { name: /Halcyon Labs/ }).first());
      await r.wait(900);
      await r.say(
        "Choose Dark for the evening, Light for the day, or let Praesto match your device.",
        "शाम के लिए Dark, दिन के लिए Light चुनें, या Praesto को अपने device के साथ match करने दें।",
      );
      await r.click(p.getByRole("menuitem", { name: /Dark/ }));
      await r.wait(2200);
      await r.say(
        "The choice is remembered on this device, and every screen follows it.",
        "यह चुनाव इस device पर याद रहता है, और हर screen इसी के हिसाब से दिखती है।",
      );
      await r.click(p.getByRole("button", { name: /Halcyon Labs/ }).first());
      await r.wait(700);
      await r.click(p.getByRole("menuitem", { name: /Light/ }));
      await r.wait(1200);
    },
  },

  passkeys: {
    module: "getting-started",
    title: "Passwordless Sign-In with Passkeys",
    description:
      "Sign in with Touch ID, Face ID, Windows Hello or a security key instead of a password, and manage the devices you’ve added.",
    path: "/profile/security-keys",
    async run(r) {
      const p = r.page;
      await r.chapter("No Passwords");
      await r.say(
        "Praesto has no passwords, so there’s nothing to forget, reuse or leak. You sign in with Google, or with a passkey.",
        "Praesto में password नहीं है, तो कुछ भूलने, दोबारा इस्तेमाल करने या leak होने का डर नहीं। आप Google से या passkey से sign in करते हैं।",
      );
      await r.chapter("What a Passkey Is");
      await r.say(
        "A passkey uses WebAuthn: you unlock with Touch ID, Face ID, Windows Hello or a security key, the same way you unlock your device.",
        "Passkey WebAuthn पर चलता है: आप Touch ID, Face ID, Windows Hello या security key से unlock करते हैं, जैसे अपना device unlock करते हैं।",
      );
      await r.say(
        "It can’t be phished, because it only ever works on Praesto’s own website.",
        "इसे phishing से नहीं चुराया जा सकता, क्योंकि यह सिर्फ़ Praesto की अपनी website पर ही काम करता है।",
      );
      await r.chapter("Add a Passkey");
      await r.say(
        "To add one, choose Add a Passkey and confirm with your fingerprint, face or device PIN.",
        "Passkey जोड़ने के लिए Add a Passkey चुनें और fingerprint, face या device PIN से confirm करें।",
      );
      await r.point(p.getByRole("button", { name: "Add a Passkey" }));
      await r.chapter("Your Devices");
      await r.say(
        "Every passkey you’ve added is listed with its browser, device and the date it was added.",
        "आपके जोड़े हर passkey की list है, browser, device और जोड़ने की तारीख के साथ।",
      );
      await r.glide(560, 360, 900);
      await r.say(
        "Lost a phone? Remove its passkey here, and it can never be used to sign in again.",
        "Phone खो गया? उसका passkey यहाँ से हटा दें, फिर उससे कभी sign in नहीं हो सकेगा।",
      );
      await r.point(p.getByRole("button", { name: "Remove" }).first());
      await r.wait(1200);
    },
  },

  // ── Platform overview ────────────────────────────────────────────────────
  "today-at-a-glance": {
    module: "overview",
    title: "Your Day at a Glance",
    description:
      "The Today screen: your hours, the month’s attendance, every request waiting on you and what’s happening across the organisation, arranged the way you like.",
    path: "/dashboard",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Today is the first screen everyone sees when they open Praesto. It answers one question: what needs my attention?",
        "Today वह पहली screen है जो Praesto खोलते ही सबको दिखती है। यह एक सवाल का जवाब देती है: मुझे किस पर ध्यान देना है?",
      );
      await r.say(
        "The greeting sums up your morning: whether you’ve punched in, how many requests wait on you, and whose birthday it is.",
        "Greeting आपकी सुबह का सार बताती है: आपने punch in किया या नहीं, कितनी requests आपका इंतज़ार कर रही हैं, और किसका birthday है।",
      );
      await r.glide(700, 230, 900);
      await r.chapter("Your Day");
      await r.say(
        "Your Day shows the hours you’ve worked since punching in, with a Punch Out button right beside it.",
        "Your Day में punch in के बाद के काम के घंटे दिखते हैं, और साथ में Punch Out का button है।",
      );
      await r.point(p.getByRole("button", { name: /Punch Out/ }));
      await r.say(
        "Below it, each block is a day of the month, coloured by attendance: present, half day, leave or week off.",
        "उसके नीचे हर block महीने का एक दिन है, attendance के हिसाब से रंगा हुआ: present, half day, leave या week off।",
      );
      await r.glide(560, 610, 900);
      await r.glide(1000, 690, 1100);
      await r.chapter("Needs Your Decision");
      await r.say(
        "Needs Your Decision lists every request waiting on you: leave, work from home, salary advances and KYC.",
        "Needs Your Decision में वे सभी requests हैं जिन पर आपका फ़ैसला बाकी है: leave, work from home, salary advance और KYC।",
      );
      await r.scroll(200, 1100);
      await r.say(
        "Approve or reject without leaving the page. Nothing gets stuck in someone’s inbox.",
        "Page छोड़े बिना approve या reject करें। किसी के inbox में कुछ अटका नहीं रहता।",
      );
      await r.point(p.getByRole("button", { name: /^Approve/ }));
      await r.scroll(-200, 800);
      await r.chapter("Make It Yours");
      await r.say(
        "Customize decides what Today shows you. Turn widgets on or off, reorder them, and choose standard or wide.",
        "Customize से तय करें कि Today पर क्या दिखे। Widgets on या off करें, उनका क्रम बदलें, और standard या wide चुनें।",
      );
      await r.click(p.getByRole("button", { name: "Customize" }));
      await r.wait(1200);
      await r.optional("toggle widget", () =>
        r.point(p.getByRole("switch", { name: "Show Organisation Today" })),
      );
      await r.say(
        "Managers and HR see organisation-wide widgets too, like workforce and hiring. Each person sees only what their role allows.",
        "Managers और HR को organisation के widgets भी दिखते हैं, जैसे workforce और hiring। हर व्यक्ति वही देखता है जिसकी उसके role में अनुमति है।",
      );
      await r.wait(800);
      await r.click(
        p.getByRole("dialog").getByRole("button", { name: "Close" }),
      );
      await r.wait(800);
    },
  },

  calendar: {
    module: "overview",
    title: "One Calendar for the Whole Company",
    description:
      "Company events and holidays on one shared calendar, today’s schedule beside it, and new events in a couple of clicks.",
    path: "/calendar",
    async run(r) {
      const p = r.page;
      await r.chapter("The Calendar");
      await r.say(
        "Calendar puts the whole company’s month on one screen: meetings, events and holidays together.",
        "Calendar पूरी कंपनी का महीना एक screen पर दिखाता है: meetings, events और holidays एक साथ।",
      );
      await r.glide(800, 400, 900);
      await r.say(
        "Holidays appear automatically from your holiday list, so nobody plans a meeting on a day off.",
        "Holidays आपकी holiday list से अपने आप दिखती हैं, ताकि कोई छुट्टी के दिन meeting न रखे।",
      );
      await r.optional("holiday", () =>
        r.point(p.getByRole("gridcell", { name: /1 November/ })),
      );
      await r.chapter("Today and Upcoming");
      await r.say(
        "On the right, today’s schedule and what’s coming up next, at a glance.",
        "दाईं ओर आज का schedule और आगे क्या आने वाला है, एक नज़र में।",
      );
      await r.glide(1260, 260, 900);
      await r.wait(800);
      await r.say(
        "Move between months with the arrows, or jump back to today in one click.",
        "Arrows से महीने बदलें, या एक click में आज पर लौटें।",
      );
      await r.click(p.getByRole("button", { name: "Next month" }));
      await r.wait(1000);
      await r.click(p.getByRole("button", { name: "Today" }));
      await r.wait(800);
      await r.chapter("New Event");
      await r.say(
        "To add an event, choose New Event, give it a title, a date and a time.",
        "Event जोड़ने के लिए New Event चुनें, उसे title, तारीख और समय दें।",
      );
      await r.click(p.getByRole("button", { name: "New Event" }));
      await r.wait(900);
      await r.type(
        p.getByRole("textbox", { name: "Title" }),
        "Quarterly planning",
        60,
      );
      // A date ahead: Praesto won't add an event in the past.
      await pickDate(
        r,
        p.getByRole("dialog").getByRole("button", { name: "Date" }),
        weekday(4),
      );
      await r.say(
        "Add notes for context, and it appears on everyone’s calendar.",
        "Context के लिए notes जोड़ें, और यह सबके calendar पर दिख जाता है।",
      );
      await r.type(
        p.getByRole("textbox", { name: /Notes/ }),
        "Bring your team’s goals",
        45,
      );
      await r.click(p.getByRole("button", { name: "Add Event" }));
      await r.wait(800);
      await r.say(
        "Add it, and the event is on the calendar straight away, for everyone to see.",
        "Add करें, और event तुरंत calendar पर आ जाता है, सबके देखने के लिए।",
      );
      await r.wait(2500);
    },
  },

  chat: {
    module: "overview",
    title: "Team Chat",
    description:
      "Direct conversations with colleagues inside Praesto, with files, pinned messages and real-time delivery, so work talk stays at work.",
    path: "/chat",
    async run(r) {
      const p = r.page;
      await r.chapter("Conversations");
      await r.say(
        "Chat keeps work conversations inside Praesto, instead of in personal messaging apps.",
        "Chat काम की बातचीत Praesto के अंदर रखता है, personal messaging apps में नहीं।",
      );
      await r.say(
        "Each conversation shows the last message and how many you haven’t read yet.",
        "हर conversation में आखिरी message और कितने messages अभी नहीं पढ़े गए, दिखता है।",
      );
      await r.glide(360, 230, 900);
      await r.chapter("Open a Chat");
      await r.say(
        "Open a conversation to see its messages. New ones arrive the moment they’re sent.",
        "Conversation खोलकर उसके messages देखें। नए messages भेजते ही आ जाते हैं।",
      );
      await r.click(p.getByRole("button", { name: /^Priya Nair/ }));
      await r.wait(1200);
      await r.chapter("Pinned Messages");
      await r.say(
        "Pin the messages that matter, like a deadline or a decision, so they stay at the top of the chat.",
        "ज़रूरी messages pin करें, जैसे कोई deadline या फ़ैसला, ताकि वे chat में सबसे ऊपर रहें।",
      );
      await r.optional("pinned", () =>
        r.point(p.getByRole("button", { name: /Pinned message 1 of/ })),
      );
      await r.chapter("Reply");
      await r.say(
        "Type a reply, attach a file if you need one, and send.",
        "Reply टाइप करें, ज़रूरत हो तो file attach करें, और भेज दें।",
      );
      await r.type(
        p.getByRole("textbox", { name: "Message Priya Nair" }),
        "Great, I’ll review the flows before 11.",
        45,
      );
      await r.optional("attach", () =>
        r.point(p.getByRole("button", { name: "Attach a file" })),
      );
      await r.click(p.getByRole("button", { name: "Send" }));
      await r.wait(1400);
      await r.say(
        "Because chat lives in Praesto, it follows the same sign-in and access rules as everything else.",
        "क्योंकि chat Praesto में है, इस पर भी वही sign-in और access rules लागू होते हैं जो बाकी सब पर।",
      );
      await r.wait(800);
    },
  },

  "organization-structure": {
    module: "overview",
    title: "Your Organisation, Mapped",
    description:
      "Headcount at a glance, every team with its lead and members, the people not yet on a team, and search across all of it.",
    path: "/organization-tree",
    async run(r) {
      const p = r.page;
      await r.chapter("Introduction");
      await r.say(
        "Organisation shows how your company is structured: who leads it, which teams it has, and who belongs where.",
        "Organisation दिखाता है कि आपकी कंपनी कैसे बनी है: कौन उसे चलाता है, कौन-सी teams हैं, और कौन कहाँ है।",
      );
      await r.chapter("Headcount");
      await r.say(
        "At the top, total people, how many are active, the number of teams, and anyone not yet on a team.",
        "ऊपर कुल लोग, कितने active हैं, teams की संख्या, और कौन अभी किसी team में नहीं है।",
      );
      await r.glide(330, 160, 800);
      await r.glide(1080, 160, 1200);
      await r.chapter("Teams");
      await r.say(
        "Every team has a lead. Team leads approve their own team’s requests and see their attendance.",
        "हर team का एक lead होता है। Team leads अपनी team की requests approve करते हैं और उनकी attendance देखते हैं।",
      );
      await r.glide(520, 470, 900);
      await r.say(
        "Open a team to see its members, with each person’s role.",
        "Team खोलकर उसके members देखें, हर व्यक्ति के role के साथ।",
      );
      await r.click(p.getByRole("button", { name: /Show 3 members/ }));
      await r.wait(1400);
      await r.chapter("Not on a Team");
      await r.say(
        "People who aren’t on a team are listed separately, so nobody falls through the cracks.",
        "जो लोग किसी team में नहीं हैं, उनकी अलग list है, ताकि कोई छूट न जाए।",
      );
      await r.scroll(260, 900);
      await r.scroll(-260, 700);
      await r.chapter("Find a Person");
      await r.say(
        "Search finds any person or team instantly, even in a large organisation.",
        "Search किसी भी व्यक्ति या team को तुरंत ढूंढ लेता है, बड़े organisation में भी।",
      );
      await r.type(p.getByPlaceholder("Find a person or team"), "Design", 90);
      await r.wait(1400);
    },
  },
};
