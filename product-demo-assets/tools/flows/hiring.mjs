// Recruitment end to end: a new opening, interviews, hiring and insights.
import { recruitmentFixtures } from "../extras.mjs";
import { choose, main, pickDate, weekday } from "./common.mjs";

/** The opening "Publish Opening" creates, so the page it lands on matches. */
const newJob = {
  id: "j9", _id: "j9", jobTitle: "Senior Backend Engineer", numberOfVacancies: 2, candidatesHired: 0,
  department: "Engineering", employmentType: "Full-time", workplaceType: "Hybrid", status: "Active",
  experience: "3", hiringManager: "Priya Nair", budget: 2800000,
  jobDescription: "Build and run the services behind Halcyon Labs’ scheduling product.",
  requiredSkills: ["Node.js", "PostgreSQL", "AWS"],
};
const NEW_JOB = [
  [/\/view-job-opening\/j9$/, { success: true, data: newJob }],
  [/\/view-applications\/j9/, { success: true, data: [] }],
];

/** Open a candidate's panel from the opening's Candidates list. */
async function openCandidate(r, name) {
  await r.click(main(r.page).getByText(name, { exact: true }).first());
  await r.wait(1200);
}

export const HIRING_FLOWS = {
  "new-job-opening": {
    module: "recruitment",
    title: "Creating a Job Opening",
    description: "A guided form for a new role: basics, workplace, requirements, description, pay and hiring team, the application form, then a review before it goes live.",
    path: "/job-openings/new",
    extra: [...NEW_JOB, ...recruitmentFixtures()],
    async run(r) {
      const p = r.page;
      await r.chapter("Basics");
      await r.say("New Opening walks you through a role step by step, so nothing important is forgotten.", "New Opening आपको एक role step by step बनाने में मदद करता है, ताकि कुछ ज़रूरी छूट न जाए।");
      await r.say("Start with the job title, the department, how many people you’re hiring and the type of employment.", "Job title, department, कितने लोग hire करने हैं और employment का type, इनसे शुरू करें।");
      await r.type(p.getByRole("combobox", { name: "Job Title" }), "Senior Backend Engineer", 55);
      await p.keyboard.press("Escape");
      await r.type(p.getByRole("combobox", { name: /Department/ }), "Engineering", 60);
      await p.keyboard.press("Escape");
      await r.click(p.getByRole("spinbutton", { name: "Openings" }));
      await p.getByRole("spinbutton", { name: "Openings" }).fill("2");
      await r.wait(500);
      await r.click(p.getByRole("button", { name: "Continue" }));
      await r.wait(900);
      await r.chapter("Workplace");
      await r.say("Choose on-site, hybrid or remote, and where the role is based. A role can have more than one location.", "On-site, hybrid या remote चुनें, और role कहाँ से है। एक role की कई locations हो सकती हैं।");
      await r.click(p.getByRole("radio", { name: "Hybrid" }));
      await r.type(p.getByRole("textbox", { name: "City" }), "Bengaluru", 70);
      await r.click(p.getByRole("button", { name: "Continue" }));
      await r.wait(900);
      await r.chapter("Requirements");
      await r.say("Set the experience you need and the skills that matter, so candidates know if they’re a fit.", "ज़रूरी experience और अहम skills तय करें, ताकि candidates जान सकें कि वे fit हैं या नहीं।");
      await r.type(p.getByRole("spinbutton", { name: "Minimum Experience" }), "3", 80);
      await r.type(p.getByRole("spinbutton", { name: /Maximum Experience/ }), "6", 80);
      await r.type(p.getByRole("textbox", { name: "Required Skills" }), "Node.js, PostgreSQL, AWS", 45);
      await r.click(p.getByRole("button", { name: "Continue" }));
      await r.wait(900);
      await r.chapter("Description");
      await r.say("Describe the role in your own words, with its responsibilities and qualifications.", "Role को अपने शब्दों में बताएँ, उसकी responsibilities और qualifications के साथ।");
      await r.type(p.getByRole("textbox", { name: "About the Role" }), "Build and run the services behind our scheduling product.", 30);
      await r.click(p.getByRole("button", { name: "Continue" }));
      await r.wait(900);
      await r.chapter("Pay and Hiring Team");
      await r.say("Add the budget, and choose whether candidates can see it on the careers page.", "Budget जोड़ें, और चुनें कि candidates इसे careers page पर देख सकें या नहीं।");
      await r.type(p.getByRole("spinbutton", { name: /Budget From/ }), "18", 80);
      await r.type(p.getByRole("spinbutton", { name: /Budget To/ }), "28", 80);
      await r.say("Pick the hiring manager, the interview pipeline the role follows, and the last date to apply.", "Hiring manager, role का interview pipeline, और apply करने की आखिरी तारीख चुनें।");
      await choose(r, "Hiring Manager", /Priya Nair/i);
      await pickDate(r, p.getByRole("button", { name: "Apply By" }), weekday(30));
      await r.click(p.getByRole("button", { name: "Continue" }));
      await r.wait(900);
      await r.chapter("Application Form");
      await r.say("Decide what the application asks for: a résumé, experience, notice period or a portfolio, each required, optional or not asked.", "तय करें कि application में क्या पूछा जाए: résumé, experience, notice period या portfolio, हर चीज़ required, optional या नहीं पूछी जाए।");
      await r.glide(700, 420, 1000);
      await r.say("You can add screening questions of your own too.", "आप अपने screening questions भी जोड़ सकते हैं।");
      await r.point(p.getByRole("button", { name: "Add Question" }));
      await r.click(p.getByRole("button", { name: "Review" }).last());
      await r.wait(1000);
      await r.chapter("Review and Publish");
      await r.say("Review shows the whole opening, with an Edit link beside each part.", "Review में पूरी opening दिखती है, हर हिस्से के साथ Edit link के साथ।");
      await r.scroll(400, 1200);
      await r.say("Publish it, and it appears on your careers page straight away, ready for applications.", "Publish करें, और यह तुरंत आपके careers page पर आ जाती है, applications के लिए तैयार।");
      await r.click(p.getByRole("button", { name: "Publish Opening" }));
      await r.wait(2200);
    },
  },

  "interview-scheduling": {
    module: "recruitment",
    title: "Scheduling Interviews",
    description: "Schedule each interview round with an interviewer and a time, then reschedule or hand it to a different interviewer when plans change.",
    path: "/view-job-opening/j1",
    extra: recruitmentFixtures(),
    async run(r) {
      const p = r.page;
      await r.chapter("Candidates");
      await r.say("Every candidate for a role is listed with their stage and how many interview rounds they’ve had.", "किसी role के हर candidate की list उनके stage और अब तक के interview rounds के साथ होती है।");
      const box = await p.getByRole("heading", { name: "Candidates" }).boundingBox();
      await r.scroll(Math.max(0, box.y - 120), 1200);
      await r.wait(600);
      await r.chapter("Schedule a Round");
      await r.say("Tom has just applied. Open his application to schedule his first interview.", "Tom ने अभी apply किया है। उनकी application खोलकर पहला interview schedule करें।");
      await openCandidate(r, "Tom Wu");
      await r.say("Choose an interviewer from the people allowed to interview, and pick a time. Interviews are an hour long.", "Interview लेने की अनुमति वाले लोगों में से एक interviewer चुनें, और समय तय करें। Interviews एक घंटे के होते हैं।");
      await r.click(p.getByRole("button", { name: /Schedule Round 1/ }));
      await r.wait(900);
      await r.type(p.getByRole("combobox", { name: "Interviewer" }), "Priya", 90);
      await r.wait(700);
      await r.click(p.getByRole("option", { name: /Priya Nair/ }));
      await pickDate(r, p.getByRole("dialog").getByRole("button", { name: "Starts" }), weekday(2));
      await r.say("Schedule it, and the candidate and interviewer both get an invitation with the time.", "Schedule करें, और candidate व interviewer दोनों को समय के साथ invitation मिलता है।");
      await r.click(p.getByRole("dialog").getByRole("button", { name: "Schedule" }));
      await r.wait(1500);
      await r.optional("calendar prompt", async () => {
        const later = p.getByRole("button", { name: "Not Now" });
        if (await later.count()) await r.click(later);
      });
      await r.chapter("Reschedule");
      await r.say("Plans change. Riya’s second round can move to a new time in a couple of clicks.", "Plans बदलते हैं। Riya का दूसरा round कुछ clicks में नए समय पर जा सकता है।");
      await openCandidate(r, "Riya Sen");
      await r.click(p.getByRole("button", { name: "Reschedule" }));
      await r.wait(700);
      const form = p.getByRole("button", { name: /Reschedule Round 2/ }).locator("xpath=..");
      await pickDate(r, form.getByRole("button").first(), weekday(5));
      await r.optional("time", () => choose(r, form.getByRole("button", { name: /9:00/ }), /^2:00 PM$/));
      await r.wait(600);
      await r.say("Everyone involved is told about the new time automatically.", "नए समय की सूचना सभी लोगों को अपने आप मिल जाती है।");
      await r.click(p.getByRole("button", { name: /Reschedule Round 2/ }));
      await r.wait(1500);
      await r.chapter("Reassign the Interviewer");
      await r.say("If the interviewer can’t make it, reassign the round to someone else without rescheduling.", "अगर interviewer उपलब्ध नहीं है, तो round किसी और को सौंप दें, समय बदले बिना।");
      await r.click(p.getByRole("button", { name: "Reassign" }).first());
      await r.wait(700);
      await r.type(p.getByRole("combobox", { name: "Interviewer" }), "Vikram", 90);
      await r.wait(700);
      await r.click(p.getByRole("option", { name: /Vikram Rao/ }));
      await r.click(p.getByRole("button", { name: "Reassign" }).last());
      await r.wait(1500);
      await r.say("Each round shows its time and interviewer, so everyone knows who is meeting whom.", "हर round में उसका समय और interviewer दिखता है, ताकि सबको पता रहे कि कौन किससे मिल रहा है।");
      await r.wait(800);
    },
  },

  "hire-or-reject": {
    module: "recruitment",
    title: "Hiring and Rejecting Candidates",
    description: "Review a candidate’s interview feedback, hire them with a salary and joining date, or reject with a reason; everyone is told, and the candidate list stays current.",
    path: "/view-job-opening/j1",
    extra: recruitmentFixtures(),
    async run(r) {
      const p = r.page;
      await r.chapter("The Decision");
      await r.say("After the interviews comes the decision. Each candidate’s rounds and feedback are in one place.", "Interviews के बाद फ़ैसले की बारी आती है। हर candidate के rounds और feedback एक जगह हैं।");
      const box = await p.getByRole("heading", { name: "Candidates" }).boundingBox();
      await r.scroll(Math.max(0, box.y - 120), 1200);
      await openCandidate(r, "Kavya Menon");
      await r.say("Kavya cleared both rounds, and her interviewers’ feedback is right here.", "Kavya ने दोनों rounds clear किए, और उनके interviewers का feedback यहीं है।");
      await r.glide(1250, 380, 900);
      await r.chapter("Hire");
      await r.say("Choose Hire, enter her monthly gross salary and joining date, and note who referred her if anyone did.", "Hire चुनें, उनकी monthly gross salary और joining date डालें, और अगर किसी ने refer किया हो तो वह भी लिखें।");
      await r.click(p.getByRole("button", { name: "Hire" }).last());
      await r.wait(900);
      await r.type(p.getByRole("spinbutton", { name: /Monthly Gross/ }), "150000", 70);
      await pickDate(r, p.getByRole("dialog").getByRole("button", { name: "Joining Date" }), weekday(21));
      await r.say("Her employee account is created for her joining date, so she can sign in on her first day.", "उनका employee account joining date के लिए बन जाता है, ताकि वे पहले दिन sign in कर सकें।");
      await r.click(p.getByRole("dialog").getByRole("button", { name: "Hire" }));
      await r.wait(1600);
      await r.chapter("Reject");
      await r.say("When someone isn’t the right fit, reject the application with a short reason.", "जब कोई सही fit न हो, तो छोटे कारण के साथ application reject करें।");
      await openCandidate(r, "Lena Ortiz");
      await r.click(p.getByRole("button", { name: "Reject" }).last());
      await r.wait(900);
      await r.type(p.getByRole("textbox", { name: "Reason" }), "Looking for more experience with design systems.", 40);
      await r.say("The candidate is told politely by email, so nobody is left waiting without an answer.", "Candidate को email से विनम्रता से बता दिया जाता है, ताकि कोई बिना जवाब के इंतज़ार न करे।");
      await r.click(p.getByRole("dialog").getByRole("button", { name: "Reject" }));
      await r.wait(1500);
      await r.chapter("Hired and Rejected");
      await r.say("Filter by stage to see who has been hired, and who was turned down.", "Stage से filter करके देखें कि किसे hire किया गया, और किसे मना किया गया।");
      await r.optional("close panel", () => r.click(p.getByRole("button", { name: "Close" }).first()));
      await r.click(p.getByRole("radio", { name: "Hired" }));
      await r.wait(1300);
      await r.click(p.getByRole("radio", { name: "Rejected" }));
      await r.wait(1300);
    },
  },

  "recruitment-insights": {
    module: "recruitment",
    title: "Recruitment Insights",
    description: "How hiring is going at a glance: active openings, applications, hiring rate, deadlines, what needs attention, and how each role and hiring manager is doing.",
    path: "/job-openings/insights",
    extra: recruitmentFixtures(),
    async run(r) {
      await r.chapter("At a Glance");
      await r.say("Recruitment Insights shows how hiring is going across every role, without counting by hand.", "Recruitment Insights दिखाता है कि हर role में hiring कैसी चल रही है, हाथ से गिने बिना।");
      await r.say("Active openings, total applications, applications per role, the hiring success rate and overdue deadlines.", "Active openings, कुल applications, हर role पर applications, hiring success rate और बीत चुकी deadlines।");
      await r.glide(420, 230, 800);
      await r.glide(1300, 230, 1300);
      await r.chapter("Worth Your Attention");
      await r.say("Worth Your Attention points out what needs doing, like an opening past its deadline or a candidate ready to hire.", "Worth Your Attention बताता है कि क्या करना बाकी है, जैसे deadline निकल चुकी opening या hire के लिए तैयार candidate।");
      await r.glide(700, 360, 900);
      await r.chapter("Roles and Managers");
      await r.say("Further down: the hiring rate for each role, openings by status, and how each hiring manager is doing.", "नीचे: हर role का hiring rate, status के हिसाब से openings, और हर hiring manager का प्रदर्शन।");
      await r.scroll(420, 1300);
      await r.chapter("Experience and Budget");
      await r.say("And what you’re asking for: the experience roles need, and how budgets are spread.", "और आप क्या माँग रहे हैं: roles के लिए ज़रूरी experience, और budgets कैसे बँटे हैं।");
      await r.scroll(420, 1300);
      await r.wait(1200);
    },
  },
};
