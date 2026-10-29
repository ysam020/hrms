import dayjs from "dayjs";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Group,
  Icon,
  Page,
  Section,
  SegmentedControl,
  Skeleton,
  Tag,
  type IconName,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { fromNow } from "@next/lib/format";
import { useGet } from "@next/lib/hooks";
import s from "./assistant.module.css";

// AI Assistants: Praesto doesn't run a chatbot of its own. It runs an MCP
// server, and people connect the AI assistant they already use to it. The
// assistant signs in through Praesto — Google or a passkey, as always — and
// can then only read what this person can, limited to what they allowed.
// This page gives the address, shows how to add it in common assistants,
// says what it can and can't do, and lists connections to disconnect.

interface Connection {
  id: string;
  clientName: string;
  scopes: { scope: string; description: string }[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

/** Short names for the consent items, for the connection list. */
const SCOPE_LABEL: Record<string, string> = {
  "profile:read": "Profile",
  "leave:read": "Leave",
  "attendance:read": "Attendance",
  "payroll:read": "Salary",
  "org:read": "Policies & holidays",
};

const CAN_ASK: { icon: IconName; title: string; example: string }[] = [
  { icon: "person", title: "Your profile", example: "What’s my joining date?" },
  { icon: "leave", title: "Leave", example: "How much leave do I have left?" },
  {
    icon: "clock",
    title: "Attendance",
    example: "How was my attendance in October?",
  },
  {
    icon: "banknote",
    title: "Salary",
    example: "What was deducted from my last salary?",
  },
  {
    icon: "doc",
    title: "Policies & announcements",
    example: "What’s our work-from-home policy?",
  },
  { icon: "flag", title: "Holidays", example: "When’s the next holiday?" },
];

const PROMISES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "lock",
    title: "Read-only",
    body: "It can answer questions but can’t apply for leave or change anything.",
  },
  {
    icon: "person",
    title: "Only your records",
    body: "It sees what you can see — never another employee’s data.",
  },
  {
    icon: "shield",
    title: "You decide",
    body: "Choose what it may read when you connect, and disconnect it here at any time.",
  },
];

type Client = "claude-code" | "apps" | "other";

export default function AiAssistants() {
  const { setAlert } = useContext(AlertContext);
  const { data, loading, error, refetch } = useGet<any>(
    API_ENDPOINTS.AI_CONNECTIONS,
  );
  const connections = asList<Connection>(data, "connections");
  // The gateway reports its own address; until it has, the build's API URL.
  const mcpUrl: string =
    data?.mcpUrl ?? `${import.meta.env.VITE_SERVER_URL || ""}/mcp`;
  const [client, setClient] = useState<Client>("claude-code");
  const [disconnecting, setDisconnecting] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);

  const disconnect = async () => {
    if (!disconnecting) return;
    setBusy(true);
    try {
      await apiClient.delete(API_ENDPOINTS.AI_CONNECTION(disconnecting.id));
      setAlert({
        open: true,
        message: `${disconnecting.clientName} disconnected.`,
        severity: "success",
      });
      setDisconnecting(null);
      refetch();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="AI Assistants"
      subtitle="Ask the AI assistant you already use about your leave, attendance, salary and policies."
      width="reading"
    >
      <Group className={`${s.hero} ${s.surface}`}>
        <span className={s.heroIcon} aria-hidden="true">
          <Icon name="assistant" size={26} />
        </span>
        <div className={s.heroText}>
          <h2 className={s.heroTitle}>Praesto MCP Server</h2>
          <p className={s.heroBody}>
            Add this address to any AI assistant that supports MCP connectors.
            It signs in through Praesto and only reads what you allow.
          </p>
        </div>
        <CopyField value={mcpUrl} label="MCP server address" />
      </Group>

      <Section
        title="Connected Assistants"
        detail={connections.length > 0 ? String(connections.length) : undefined}
      >
        {loading ? (
          <Skeleton height={72} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : connections.length === 0 ? (
          <EmptyState icon="assistant" title="No assistants connected">
            Once you allow an assistant, it appears here so you can see when it
            was last used and disconnect it.
          </EmptyState>
        ) : (
          <Group className={s.surface}>
            {connections.map((c) => (
              <div key={c.id} className={s.row}>
                <span className={s.avatar} aria-hidden="true">
                  {c.clientName.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <div className={s.rowMain}>
                  <span className={s.rowTitle}>{c.clientName}</span>
                  <span className={s.tags}>
                    {c.scopes.map((x) => (
                      <Tag key={x.scope}>{SCOPE_LABEL[x.scope] ?? x.scope}</Tag>
                    ))}
                  </span>
                  <span className={s.rowDetail}>
                    {c.lastUsedAt
                      ? `Used ${fromNow(c.lastUsedAt)}`
                      : "Not used yet"}
                    {` · Connected ${dayjs(c.createdAt).format("D MMM YYYY")}`}
                    {` · Expires ${dayjs(c.expiresAt).format("D MMM YYYY")}`}
                  </span>
                </div>
                <Button
                  variant="tintedDanger"
                  size="small"
                  onClick={() => setDisconnecting(c)}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </Group>
        )}
      </Section>

      <Section title="Set Up">
        <SegmentedControl<Client>
          label="Assistant"
          idPrefix="setup"
          value={client}
          onChange={setClient}
          segments={[
            { value: "claude-code", label: "Claude Code" },
            { value: "apps", label: "Claude & ChatGPT" },
            { value: "other", label: "Other" },
          ]}
        />
        <div
          id={`setup-panel-${client}`}
          role="tabpanel"
          className={s.setupPanel}
        >
          {client === "claude-code" ? (
            <Steps
              tip={
                <>
                  Inside a code project, add “in Praesto” to your question so
                  Claude asks Praesto rather than searching your code.
                </>
              }
            >
              <li>
                Add Praesto from a terminal:
                <CopyField
                  value={`claude mcp add --transport http praesto ${mcpUrl}`}
                  label="Claude Code command"
                  compact
                />
              </li>
              <li>
                Start a new Claude Code session, run <kbd>/mcp</kbd>, choose{" "}
                <strong>praesto</strong> and select{" "}
                <strong>Authenticate</strong>.
              </li>
              <li>
                Sign in to Praesto, choose what Claude may see, and select{" "}
                <strong>Allow</strong>.
              </li>
            </Steps>
          ) : client === "apps" ? (
            <Steps
              tip={
                <>
                  Custom connectors need a paid plan in both apps, and ChatGPT’s
                  Developer mode isn’t available on every plan.
                </>
              }
            >
              <li>
                Open your assistant’s connector settings. In Claude, go to{" "}
                <strong>Settings → Connectors → Add custom connector</strong>.
                In ChatGPT, turn on{" "}
                <strong>
                  Settings → Apps & Connectors → Advanced → Developer mode
                </strong>
                , then select <strong>Create</strong>.
              </li>
              <li>
                Name it Praesto, paste the address above, and leave any client
                ID and secret empty — the assistant registers itself.
              </li>
              <li>
                Sign in to Praesto when asked, choose what it may see, and
                select <strong>Allow</strong>.
              </li>
              <li>
                In a chat, turn Praesto on from the tools or connectors menu if
                it isn’t already, then ask away.
              </li>
            </Steps>
          ) : (
            <Steps
              tip={
                <>
                  Organisations’ public job openings are also available without
                  signing in, at <code>{mcpUrl}/public</code>.
                </>
              }
            >
              <li>
                Use any assistant or tool that supports remote MCP servers over
                Streamable HTTP with OAuth sign-in.
              </li>
              <li>
                Add the address above as a server. Praesto supports automatic
                client registration, so there’s nothing else to fill in.
              </li>
              <li>
                Sign in to Praesto when asked, choose what it may see, and
                select <strong>Allow</strong>.
              </li>
            </Steps>
          )}
        </div>
      </Section>

      <Section title="What You Can Ask">
        <ul className={s.cards}>
          {CAN_ASK.map((c) => (
            <li key={c.title} className={s.askCard}>
              <Icon name={c.icon} size={20} className={s.cardIcon} />
              <span className={s.cardTitle}>{c.title}</span>
              <span className={s.cardExample}>“{c.example}”</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Your Data, Your Rules">
        <Group className={`${s.promises} ${s.surface}`}>
          {PROMISES.map((p) => (
            <div key={p.title} className={s.promise}>
              <Icon name={p.icon} size={20} className={s.promiseIcon} />
              <div>
                <span className={s.promiseTitle}>{p.title}</span>
                <p className={s.promiseBody}>{p.body}</p>
              </div>
            </div>
          ))}
        </Group>
        <p className={s.note}>
          What the assistant reads is sent to the company that runs it and is
          handled under that company’s terms. Salary is off unless you allow it.
        </p>
      </Section>

      <ConfirmDialog
        open={Boolean(disconnecting)}
        onClose={() => setDisconnecting(null)}
        onConfirm={disconnect}
        busy={busy}
        title={`Disconnect ${disconnecting?.clientName ?? "Assistant"}?`}
        description="It loses access to Praesto immediately. You can connect it again later."
        confirmLabel="Disconnect"
      />
    </Page>
  );
}

function Steps({ children, tip }: { children: ReactNode; tip?: ReactNode }) {
  return (
    <>
      <ol className={s.steps}>{children}</ol>
      {tip && (
        <p className={s.tip}>
          <Icon name="info" size={14} />
          <span>{tip}</span>
        </p>
      )}
    </>
  );
}

/** A value in a monospace field with a copy button that confirms. */
function CopyField({
  value,
  label,
  compact,
}: {
  value: string;
  label: string;
  compact?: boolean;
}) {
  const { setAlert } = useContext(AlertContext);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setAlert({
        open: true,
        message: "Couldn’t copy. Select the text and copy it instead.",
        severity: "error",
      });
    }
  };

  return (
    <div className={compact ? `${s.copy} ${s.copyCompact}` : s.copy}>
      <code aria-label={label}>{value}</code>
      <Button
        size="small"
        variant={copied ? "tinted" : "secondary"}
        icon={copied ? "check" : undefined}
        onClick={copy}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
      <span className="px-sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
}
