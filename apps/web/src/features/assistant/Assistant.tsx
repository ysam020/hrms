import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  fetchCsrfToken,
  getAccessToken,
  isExpiringSoon,
  performRefresh,
  registerPendingAbort,
  unregisterPendingAbort,
} from "@web/core/http/axiosConfig";
import { Button, Icon, IconButton, Sheet } from "@next/ui";
import { useIsCompact } from "@next/lib/hooks";
import s from "./assistant.module.css";

// The HR assistant (Classic's features/chatbot/Chatbot.tsx). The gateway's
// /chatbot/message answers over server-sent events and only ever reads the
// signed-in user's own records. The conversation lives in memory for the
// session and the last turns go up with each question as context.

const API_URL = import.meta.env.VITE_API_STRING as string;
const HISTORY_TURNS = 10;
const ABORT_KEY = "chatbot:sse";

const SUGGESTED = [
  "How many leaves do I have left?",
  "Show my attendance for this month",
  "What is the work from home policy?",
  "What is my current salary?",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

const isMac =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.userAgent);

/** Toolbar button that opens the assistant; ⇧⌘A toggles it anywhere. */
export function AssistantButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <IconButton
        icon="assistant"
        label="Assistant"
        title={`Assistant (${isMac ? "⇧⌘A" : "Ctrl+Shift+A"})`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      />
      <AssistantSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

async function post(
  token: string | null,
  csrf: string,
  message: string,
  history: Message[],
  signal: AbortSignal,
) {
  return fetch(`${API_URL}${API_ENDPOINTS.CHATBOT_MESSAGE}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ message, history }),
    signal,
  });
}

function AssistantSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useContext(UserContext);
  const compact = useIsCompact();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  // Replace the reply being written (always the last message).
  const setReply = (content: string) =>
    setMessages((prev) => [
      ...prev.slice(0, -1),
      { role: "assistant", content },
    ]);

  const send = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      const history = messages
        .filter((m) => m.content)
        .slice(-HISTORY_TURNS)
        .map(({ role, content }) => ({ role, content }));
      setMessages((prev) => [
        ...prev,
        { role: "user", content },
        { role: "assistant", content: "" },
      ]);
      setInput("");

      if (!navigator.onLine) {
        setReply("You're offline. Ask again when you're back online.");
        return;
      }

      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      registerPendingAbort(ABORT_KEY, controller);

      try {
        // Same proactive refresh and single 401 retry as the axios client:
        // a stream can't be replayed by the interceptor.
        let token = getAccessToken();
        if (token && isExpiringSoon(token, 60)) {
          token = await performRefresh().catch(() => token);
        }
        let res = await post(
          token,
          await fetchCsrfToken(),
          content,
          history,
          controller.signal,
        );
        if (res.status === 401) {
          try {
            token = await performRefresh();
            res = await post(
              token,
              await fetchCsrfToken(),
              content,
              history,
              controller.signal,
            );
          } catch {
            setReply("Your session has expired. Sign in again to continue.");
            return;
          }
        }

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => null);
          setReply(body?.message ?? "Something went wrong. Try again.");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let reply = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let payload: { token?: string; error?: string; done?: boolean };
            try {
              payload = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (payload.token) {
              reply += payload.token;
              setReply(reply);
            }
            if (payload.error) setReply(payload.error);
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setReply("The connection was lost. Try again.");
      } finally {
        unregisterPendingAbort(ABORT_KEY);
        abortRef.current = null;
        setStreaming(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [input, messages, streaming],
  );

  const newConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    inputRef.current?.focus();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const last = messages.length - 1;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Assistant"
      edge={compact ? "bottom" : "right"}
      width={400}
      footer={
        <form className={s.composer} onSubmit={onSubmit}>
          {messages.length > 0 && (
            <IconButton
              icon="edit"
              label="New Conversation"
              onClick={newConversation}
            />
          )}
          <textarea
            ref={inputRef}
            className={s.input}
            rows={1}
            maxLength={1000}
            placeholder="Ask a question"
            aria-label="Message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            className={s.send}
            disabled={!input.trim() || streaming}
            aria-label="Send"
          >
            <Icon name="arrowRight" size={16} style={{ rotate: "-90deg" }} />
          </button>
        </form>
      }
    >
      <div className={s.body} data-compact={compact || undefined}>
        {messages.length === 0 ? (
          <div className={s.intro}>
            <span className={s.mark} aria-hidden>
              <Icon name="assistant" size={24} />
            </span>
            <h3 className={s.greeting}>
              {user?.first_name ? `Hi, ${user.first_name}.` : "Hi."} How can I
              help?
            </h3>
            <p className={s.hint}>
              Ask about your leave, attendance, pay or company policies. I can
              only see your own records.
            </p>
            <div className={s.suggestions}>
              {SUGGESTED.map((q) => (
                <Button
                  key={q}
                  size="small"
                  variant="tinted"
                  onClick={() => send(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ol className={s.thread} aria-live="polite" aria-busy={streaming}>
            {messages.map((m, i) => (
              <li key={i} className={s.message} data-role={m.role}>
                {m.content ? (
                  <span className={s.bubble}>
                    {m.content}
                    {streaming && i === last && m.role === "assistant" && (
                      <span className={s.caret} aria-hidden />
                    )}
                  </span>
                ) : (
                  <span className={s.typing} aria-label="Thinking">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>
    </Sheet>
  );
}
