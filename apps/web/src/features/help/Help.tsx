import { useContext, useMemo } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { useTransitionNavigate } from "@next/motion";
import { Button, Icon, Page, type IconName } from "@next/ui";
import { canRaiseSupport, isSupportAgent } from "@next/features/support/config";
import { canUseSupport } from "@next/app/navigation";
import s from "./help.module.css";

// Keyboard shortcuts — the reference page of Help & Support — with a way to
// reach Praesto that fits who's reading. The list is this app's own
// (AppShell and the command palette), not Classic's; add a row here only
// when a key is actually bound.

const isMac =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.userAgent);

interface Group {
  title: string;
  hint: string;
  icon: IconName;
  items: { keys: string[]; label: string }[];
}

export default function Help() {
  const mod = isMac ? "⌘" : "Ctrl";
  const groups = useMemo<Group[]>(
    () => [
      {
        title: "Everywhere",
        hint: "Work on any page",
        icon: "sparkle",
        items: [
          { keys: [mod, "K"], label: "Search pages and people" },
          { keys: [mod, "\\"], label: "Show or hide the sidebar" },
          { keys: ["Esc"], label: "Close a dialog, sheet, or menu" },
        ],
      },
      {
        title: "In Search",
        hint: `After pressing ${mod} K`,
        icon: "search",
        items: [
          { keys: ["↑", "↓"], label: "Move between results" },
          { keys: ["Return"], label: "Open the selected result" },
        ],
      },
      {
        title: "In Lists",
        hint: "Tables and lists of records",
        icon: "table",
        items: [
          { keys: ["Tab"], label: "Move to the next row or control" },
          { keys: ["Return"], label: "Open the focused row" },
        ],
      },
    ],
    [mod],
  );

  return (
    <Page
      title="Keyboard Shortcuts"
      subtitle="Get around Praesto faster"
      width="wide"
    >
      <ContactCard />
      <div className={s.groups} data-tour="help-shortcuts">
        {groups.map((g) => (
          <section
            key={g.title}
            className={s.group}
            aria-labelledby={`sc-${g.icon}`}
          >
            <header className={s.groupHead}>
              <span className={s.groupIcon} aria-hidden>
                <Icon name={g.icon} size={16} />
              </span>
              <span style={{ display: "grid" }}>
                <h2 className={s.groupTitle} id={`sc-${g.icon}`}>
                  {g.title}
                </h2>
                <span className={s.groupHint}>{g.hint}</span>
              </span>
            </header>
            <ul className={s.rows}>
              {g.items.map((sc) => (
                <li key={sc.label} className={s.row}>
                  <span>{sc.label}</span>
                  <span className={s.keys} aria-label={sc.keys.join(" ")}>
                    {sc.keys.map((k) => (
                      <kbd key={k} className={s.key}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className={s.footnote}>
        {isMac
          ? "On Windows and Linux, use Ctrl in place of ⌘."
          : "On a Mac, use ⌘ in place of Ctrl."}
      </p>
    </Page>
  );
}

/** How this person gets help from Praesto. */
function ContactCard() {
  const { user } = useContext(UserContext);
  const navigate = useTransitionNavigate();
  const agent = isSupportAgent(user);
  const canRaise = canRaiseSupport(user);
  const canView = canUseSupport(user);

  return (
    <section className={s.contact} aria-labelledby="help-contact">
      <span className={s.contactIcon} aria-hidden>
        <Icon name={agent ? "inbox" : "lifebuoy"} size={22} />
      </span>
      <h2 className={s.contactTitle} id="help-contact">
        {agent ? "Support queue" : "Need help with Praesto?"}
      </h2>
      <p className={s.contactBody}>
        {agent
          ? "Tickets from every organization are waiting in the Support Console."
          : canRaise
            ? "Report a bug, a billing problem or an idea. The Praesto team replies on the ticket, and you’ll get a notification and an email."
            : canView
              ? "Follow your organization’s tickets with the Praesto team."
              : "Ask your organization’s owner or admin — they can raise a ticket with the Praesto team for you."}
      </p>
      {(agent || canView) && (
        <div className={s.contactActions}>
          {canView && (
            <Button onClick={() => navigate("/support")}>
              {agent ? "Our Tickets" : "View Tickets"}
            </Button>
          )}
          {agent ? (
            <Button
              variant="primary"
              icon="inbox"
              onClick={() => navigate("/platform/support")}
            >
              Open Support Console
            </Button>
          ) : (
            canRaise && (
              <Button
                variant="primary"
                icon="plus"
                onClick={() => navigate("/support/new")}
              >
                Raise a Ticket
              </Button>
            )
          )}
        </div>
      )}
    </section>
  );
}
