import { Icon, Page, Section, type IconName } from "@next/ui";
import { useMemo } from "react";

// Help (Classic's features/layout/Help.tsx). Support contacts are Classic's;
// the shortcut list is this app's own (AppShell and the command palette),
// not Classic's, which binds a different set.

const isMac =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.userAgent);

const SUPPORT: {
  icon: IconName;
  label: string;
  email: string;
  note: string;
}[] = [
  {
    icon: "lifebuoy",
    label: "Support",
    email: "support@praesto.in",
    note: "Questions or problems with Praesto",
  },
  {
    icon: "briefcase",
    label: "Business Enquiries",
    email: "hello@praesto.in",
    note: "Plans, partnerships, and sales",
  },
];

export default function Help() {
  const mod = isMac ? "⌘" : "Ctrl";
  const shortcuts = useMemo(
    () => [
      {
        group: "Everywhere",
        items: [
          { keys: [mod, "K"], label: "Search pages and people" },
          { keys: [mod, "\\"], label: "Show or hide the sidebar" },
          { keys: ["⇧", mod, "A"], label: "Open or close the Assistant" },
          { keys: ["Esc"], label: "Close a dialog, sheet, or menu" },
        ],
      },
      {
        group: "In Search",
        items: [
          { keys: ["↑", "↓"], label: "Move between results" },
          { keys: ["Return"], label: "Open the selected result" },
        ],
      },
      {
        group: "In Lists",
        items: [
          { keys: ["Tab"], label: "Move to the next row or control" },
          { keys: ["Return"], label: "Open the focused row" },
        ],
      },
    ],
    [mod],
  );

  return (
    <Page title="Help" width="reading">
      <Section title="Contact Us">
        <ul style={{ display: "grid", gap: 12 }}>
          {SUPPORT.map((s) => (
            <li
              key={s.email}
              className="px-row"
              style={{ flexWrap: "nowrap", gap: 12, alignItems: "flex-start" }}
            >
              <Icon
                name={s.icon}
                size={22}
                style={{ color: "var(--px-accent)", marginTop: 2 }}
              />
              <div style={{ display: "grid" }}>
                <span className="px-headline">{s.label}</span>
                <a href={`mailto:${s.email}`}>{s.email}</a>
                <span className="px-meta">{s.note}</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      {shortcuts.map((g) => (
        <Section
          key={g.group}
          title={g.group === "Everywhere" ? "Keyboard Shortcuts" : undefined}
          detail={g.group}
        >
          <ul className="px-hairline-list">
            {g.items.map((sc) => (
              <li
                key={sc.label}
                className="px-row"
                style={{
                  justifyContent: "space-between",
                  flexWrap: "nowrap",
                  padding: "10px 0",
                }}
              >
                <span>{sc.label}</span>
                <span
                  className="px-row"
                  style={{ gap: 4, flexWrap: "nowrap" }}
                  aria-label={sc.keys.join(" ")}
                >
                  {sc.keys.map((k) => (
                    <kbd
                      key={k}
                      style={{
                        minWidth: 26,
                        padding: "2px 7px",
                        borderRadius: 6,
                        textAlign: "center",
                        font: "var(--px-type-callout)",
                        fontFamily: "var(--px-font)",
                        background: "var(--px-bg-grouped)",
                        boxShadow:
                          "inset 0 -1px 0 var(--px-separator-strong), 0 0 0 0.5px var(--px-separator)",
                      }}
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </Page>
  );
}
