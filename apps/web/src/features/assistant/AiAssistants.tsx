import dayjs from "dayjs";
import { useContext, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Group,
  Page,
  Section,
  Skeleton,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import s from "./assistant.module.css";

// AI Assistants: Praesto no longer runs its own chatbot. Instead people
// connect the AI assistant they already use (any client that supports
// remote MCP connectors) to Praesto's MCP endpoint. The assistant signs in
// through Praesto — Google or a passkey, as always — and can then only read
// what this person can, limited to what they allowed. This page explains
// how, and lists the assistants connected so they can be disconnected.

interface Connection {
  id: string;
  clientName: string;
  scopes: { scope: string; description: string }[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

export default function AiAssistants() {
  const { setAlert } = useContext(AlertContext);
  const { data, loading, error, refetch } = useGet<any>(
    API_ENDPOINTS.AI_CONNECTIONS,
  );
  const connections = asList<Connection>(data, "connections");
  // The gateway reports its own address; until it has, the build's API URL.
  const mcpUrl: string =
    data?.mcpUrl ?? `${import.meta.env.VITE_SERVER_URL || ""}/mcp`;
  const [disconnecting, setDisconnecting] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setAlert({ open: true, message: "Copied.", severity: "success" });
    } catch {
      setAlert({
        open: true,
        message: "Couldn’t copy. Select the address and copy it instead.",
        severity: "error",
      });
    }
  };

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
      subtitle="Ask your own AI assistant about your leave, attendance, salary and policies."
      width="reading"
    >
      <Section title="Connect an Assistant">
        <Group>
          <ol className={s.steps}>
            <li>
              In your AI assistant, add a custom connector (it may be called an
              MCP server or integration) with this address:
              <div className={s.endpoint} style={{ marginTop: 8 }}>
                <code>{mcpUrl}</code>
                <Button size="small" onClick={copy}>
                  Copy
                </Button>
              </div>
            </li>
            <li>
              When it asks you to sign in, sign in to Praesto as you normally
              do, with Google or a passkey.
            </li>
            <li>
              Choose what the assistant may see, then select Allow. You can
              disconnect it here at any time.
            </li>
          </ol>
        </Group>
        <p className={s.note}>
          The assistant can only read — it can’t apply for leave or change
          anything — and only ever your own records and your organisation’s
          policies, announcements and holidays. What it reads is sent to the
          company that runs the assistant, under that company’s terms.
        </p>
      </Section>

      <Section title="Connected Assistants">
        {loading ? (
          <Skeleton height={56} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : connections.length === 0 ? (
          <EmptyState icon="assistant" title="No assistants connected" />
        ) : (
          <Group>
            {connections.map((c) => (
              <div key={c.id} className={s.row}>
                <div className={s.rowMain}>
                  <span className={s.rowTitle}>{c.clientName}</span>
                  <span className={s.rowDetail}>
                    {c.scopes.map((x) => x.description).join(" · ")}
                  </span>
                  <span className={s.rowDetail}>
                    Connected {dayjs(c.createdAt).format("D MMM YYYY")}
                    {c.lastUsedAt
                      ? ` · Last used ${dayjs(c.lastUsedAt).format("D MMM, HH:mm")}`
                      : " · Not used yet"}
                    {` · Expires ${dayjs(c.expiresAt).format("D MMM YYYY")}`}
                  </span>
                </div>
                <Button
                  variant="tintedDanger"
                  onClick={() => setDisconnecting(c)}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </Group>
        )}
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
