import type { TourModuleDef } from "../types";
import { intro, page } from "./shared";

// Getting started, and the everyday workspace: Today, Approvals, Calendar,
// Chat, and your own profile.

export const workspaceTours: TourModuleDef[] = [
  {
    id: "welcome",
    label: "Getting Started",
    summary: "Finding your way around: navigation, search and notifications.",
    route: "/dashboard",
    steps: [
      {
        id: "hello",
        target: ":root > body",
        placement: "center",
        title: "Welcome to Praesto",
        content:
          "This tour shows the parts of Praesto you can use, page by page. Use Next and Back (or the arrow keys). Press Esc or × to pause — you can pick up where you left off from Help & Support → Product Tours.",
      },
      {
        id: "sidebar",
        target: "sidebar-nav",
        placement: "right-start",
        sidebar: true,
        prepare: (ctx) => ctx.showSidebar(),
        title: "Everything is in the sidebar",
        content:
          "Each area of Praesto has an entry here. Areas with several pages expand to show them. You only see the areas your role gives you access to.",
      },
      {
        id: "navigation",
        target: "page-nav",
        when: (env) => !env.docked,
        title: "Open the navigation",
        content:
          "On smaller screens the sidebar folds away. Tap here to open it; on phones the tab bar at the bottom has the most-used pages.",
      },
      {
        id: "search",
        target: ["sidebar-search", "toolbar-search"],
        placement: "auto",
        title: "Search anything",
        content:
          "Jump to any page or person by name. On a keyboard, press ⌘K (Ctrl K on Windows) from anywhere.",
      },
      {
        id: "notifications",
        target: "notifications",
        placement: "bottom",
        title: "Notifications",
        content:
          "Approvals, replies and updates that involve you collect here. The badge shows how many are new.",
      },
      {
        id: "account",
        target: "sidebar-account",
        placement: "right-start",
        sidebar: true,
        title: "Your account",
        content:
          "Open your profile, switch between light and dark appearance, or sign out.",
      },
    ],
  },
  {
    id: "today",
    label: "Today",
    summary: "Your dashboard: the day at a glance and widgets for your role.",
    route: "/dashboard",
    steps: [
      intro(
        "today",
        "Today",
        "Your home page. It opens after you sign in and summarises what needs your attention.",
      ),
      {
        id: "hero",
        target: "today-hero",
        title: "Your day at a glance",
        content:
          "A one-line brief: whether you’ve punched in, how many requests wait on you, and colleagues celebrating today.",
      },
      {
        id: "punch",
        target: "today-punch",
        timeout: 3000,
        title: "Punch in and out",
        content:
          "Record the start and end of your working day here. Your punches feed My Attendance.",
      },
      {
        id: "widgets",
        target: "today-widgets",
        placement: "top",
        title: "Widgets for your role",
        content:
          "What you see depends on your role — your leave balance and requests, your team’s attendance if you lead a team, organisation figures for HR.",
      },
      {
        id: "customize",
        target: "today-customize",
        title: "Make it yours",
        content:
          "Choose which widgets appear, their order and size. You can only add widgets your role allows.",
      },
    ],
  },
  {
    id: "approvals",
    label: "Approvals",
    summary: "Requests waiting for your decision, in one inbox.",
    route: "/approvals",
    steps: [
      intro(
        "approvals",
        "Approvals",
        "Leave, work-from-home, resignation, overtime, salary advance and KYC requests that need your decision land here. The sidebar badge counts them.",
      ),
      {
        id: "filter",
        target: "approvals-filter",
        timeout: 2500,
        title: "Filter by type",
        content:
          "When requests of several kinds are waiting, narrow the list to one kind.",
      },
      {
        id: "list",
        target: "approvals-list",
        title: "Decide in place",
        content:
          "Each request shows who asked and for what. Approve or reject it right here; the requester is notified. Nothing is decided until you choose.",
      },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    summary: "Holidays and events by month.",
    route: "/calendar",
    steps: [
      intro(
        "calendar",
        "Calendar",
        "Organisation holidays and events, laid out by month.",
      ),
      {
        id: "month",
        target: "calendar-month",
        placement: "auto",
        title: "Browse by month",
        content:
          "Move between months with the arrows, or jump back with Today. Choose a day to see everything on it.",
      },
      {
        id: "new",
        target: "calendar-new",
        title: "Add an event",
        content: "Create an event on the calendar with New Event.",
      },
    ],
  },
  {
    id: "chat",
    label: "Chat",
    summary: "Direct messages with colleagues.",
    route: "/chat",
    steps: [
      intro("chat", "Chat", "Message colleagues one-to-one inside Praesto."),
      {
        id: "list",
        target: "chat-list",
        placement: "right-start",
        title: "Your conversations",
        content:
          "Recent conversations are listed here, with unread ones marked. Open one to read and reply.",
      },
      {
        id: "search",
        target: "chat-search",
        title: "Start a conversation",
        content: "Type a colleague’s name to start a new conversation.",
      },
    ],
  },
  {
    id: "profile",
    label: "My Profile",
    summary: "Your details, notification devices and passkeys.",
    route: "/profile",
    steps: [
      page(
        "intro",
        "My Profile",
        "Your own record in Praesto. Open it any time from your name at the top of the sidebar.",
      ),
      {
        id: "sections",
        target: "profile-sections",
        title: "Details, notifications and passkeys",
        content:
          "Details shows your personal and work information. Notifications lists the devices that receive push alerts. Passkeys lets you sign in with your device instead of a password.",
      },
    ],
  },
];
