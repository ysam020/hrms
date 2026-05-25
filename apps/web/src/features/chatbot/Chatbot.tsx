import { useState, useRef, useEffect, useContext, useCallback } from "react";
import type React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import Fab from "@mui/material/Fab";
import { AnimatePresence, motion } from "framer-motion";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SendIcon from "@mui/icons-material/Send";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { useTheme, alpha } from "@mui/material/styles";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  getAccessToken,
  fetchCsrfToken,
  performRefresh,
  isExpiringSoon,
  registerPendingAbort,
  unregisterPendingAbort,
} from "@web/core/http/axiosConfig";

const API_URL = import.meta.env.VITE_API_STRING as string;

interface Message {
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

const SUGGESTED = [
  "What is the maternity leave policy?",
  "How many leaves do I have remaining?",
  "What is my current salary?",
  "Show my attendance for this month",
  "What is the work from home policy?",
  "What is my date of birth on record?",
];

export default function Chatbot() {
  const { user } = useContext(UserContext);
  const muiTheme = useTheme();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isDark = muiTheme.palette.mode === "dark";

  const BRAND = isDark ? "#0c3f61" : "#111b21";
  const BRAND_HOVER = isDark ? "#0a3555" : "#0f1a1f";

  const c = {
    panelBg: muiTheme.palette.background.paper,
    surfaceBg: muiTheme.palette.background.default,
    botBubble: muiTheme.palette.background.default,
    userBubble: muiTheme.palette.primary.main,
    border: muiTheme.palette.divider,
    text: muiTheme.palette.text.primary,
    subText: muiTheme.palette.text.secondary,
    primary: muiTheme.palette.primary.main,
    brand: BRAND,
    brandHover: BRAND_HOVER,
    panelShadow: isDark
      ? `0 8px 32px ${alpha(muiTheme.palette.common.black, 0.55)}`
      : `0 8px 32px ${alpha(muiTheme.palette.common.black, 0.12)}`,
    fabShadow: isDark
      ? `0 4px 20px ${alpha(muiTheme.palette.common.black, 0.5)}`
      : `0 4px 20px ${alpha(BRAND, 0.35)}`,
  };

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const streamSse = useCallback(
    async (
      token: string | null,
      csrfToken: string,
      content: string,
      history: { role: string; content: string }[],
      controller: AbortController,
    ) => {
      const res = await fetch(`${API_URL}${API_ENDPOINTS.CHATBOT_MESSAGE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ message: content, history }),
        signal: controller.signal,
      });
      return res;
    },
    [],
  );

  const sendMessage = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      const userMsg: Message = { role: "user", content, ts: new Date() };
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const withUser = [...messages, userMsg];
      const botMsg: Message = {
        role: "assistant",
        content: "",
        ts: new Date(),
      };

      setMessages([...withUser, botMsg]);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      registerPendingAbort("chatbot:sse", controller);

      try {
        // Mirror the interceptor's proactive refresh so the SSE stream never
        // starts with a token that will expire mid-stream.
        let token = getAccessToken();
        if (token && isExpiringSoon(token, 60)) {
          try {
            token = await performRefresh();
          } catch {}
        }

        const csrfToken = await fetchCsrfToken();

        let res = await streamSse(
          token,
          csrfToken,
          content,
          history,
          controller,
        );

        // Single 401 retry — mirrors the axios response interceptor.
        if (res.status === 401) {
          try {
            token = await performRefresh();
            const freshCsrf = await fetchCsrfToken();
            res = await streamSse(
              token,
              freshCsrf,
              content,
              history,
              controller,
            );
          } catch {
            setMessages((prev) => {
              const u = [...prev];
              u[u.length - 1] = {
                ...u[u.length - 1],
                content: "Session expired. Please refresh the page.",
              };
              return u;
            });
            return;
          }
        }

        if (!res.ok || !res.body) {
          let errMsg = "Something went wrong. Please try again.";
          try {
            const j = await res.json();
            errMsg = j.message ?? errMsg;
          } catch {}
          setMessages((prev) => {
            const u = [...prev];
            u[u.length - 1] = { ...u[u.length - 1], content: errMsg };
            return u;
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.token) {
                fullContent += payload.token;
                setMessages((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = {
                    ...u[u.length - 1],
                    content: fullContent,
                  };
                  return u;
                });
              }
              if (payload.error) {
                setMessages((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = {
                    ...u[u.length - 1],
                    content: payload.error,
                  };
                  return u;
                });
              }
              if (payload.done) break;
            } catch {}
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setMessages((prev) => {
          const u = [...prev];
          u[u.length - 1] = {
            ...u[u.length - 1],
            content: "Connection lost. Please try again.",
          };
          return u;
        });
      } finally {
        unregisterPendingAbort("chatbot:sse");
        abortRef.current = null;
        setStreaming(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [input, streaming, messages, streamSse],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* ── Floating panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="HRMS AI Assistant"
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 12 }}
            transition={{
              type: "spring",
              stiffness: 340,
              damping: 26,
              mass: 0.8,
            }}
            style={{
              position: "fixed",
              bottom: 88,
              right: 24,
              width: 380,
              height: 520,
              display: "flex",
              flexDirection: "column",
              borderRadius: 12,
              border: `1px solid ${c.border}`,
              background: c.panelBg,
              boxShadow: c.panelShadow,
              overflow: "hidden",
              transformOrigin: "bottom right",
              zIndex: 1300,
            }}
          >
            {/* Header */}
            <Box
              sx={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2,
                py: 1.25,
                bgcolor: c.surfaceBg,
                borderBottom: `1px solid ${c.border}`,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                <Avatar sx={{ width: 30, height: 30, bgcolor: c.brand }}>
                  <SmartToyIcon sx={{ fontSize: 17, color: "#fff" }} />
                </Avatar>
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  sx={{ color: c.text }}
                >
                  HRMS Assistant
                </Typography>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center" }}>
                {messages.length > 0 && (
                  <Tooltip title="Clear conversation">
                    <IconButton
                      size="small"
                      onClick={clearConversation}
                      aria-label="Clear conversation"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <IconButton
                  size="small"
                  onClick={() => setOpen(false)}
                  aria-label="Close assistant"
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            {/* Messages */}
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                px: 2,
                py: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
              }}
            >
              {messages.length === 0 && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: 1,
                    gap: 1.5,
                    textAlign: "center",
                    px: 1,
                  }}
                >
                  <SmartToyIcon
                    sx={{
                      fontSize: 40,
                      opacity: 0.7,
                      color: "#fff",
                    }}
                  />

                  <Box>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      Hi{user?.first_name ? `, ${user.first_name}` : ""}! How
                      can I help?
                    </Typography>
                    <Typography variant="caption" sx={{ color: c.subText }}>
                      Ask about leaves, salary, attendance, or policies.
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 0.75,
                      justifyContent: "center",
                    }}
                  >
                    {SUGGESTED.map((q) => (
                      <Chip
                        key={q}
                        label={q}
                        size="small"
                        variant="outlined"
                        clickable
                        onClick={() => sendMessage(q)}
                        sx={{ fontSize: "0.7rem" }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 360,
                    damping: 28,
                    mass: 0.7,
                  }}
                  style={{
                    display: "flex",
                    flexDirection: msg.role === "user" ? "row-reverse" : "row",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <Avatar
                    sx={{
                      width: 24,
                      height: 24,
                      flexShrink: 0,
                      bgcolor:
                        msg.role === "user"
                          ? c.primary
                          : muiTheme.palette.secondary.main,
                      mt: 0.25,
                    }}
                  >
                    {msg.role === "user" ? (
                      <AccountCircleIcon sx={{ fontSize: 14, color: "#fff" }} />
                    ) : (
                      <SmartToyIcon sx={{ fontSize: 14, color: "#fff" }} />
                    )}
                  </Avatar>

                  <Paper
                    elevation={0}
                    sx={{
                      px: 1.5,
                      py: 1,
                      maxWidth: "78%",
                      borderRadius:
                        msg.role === "user"
                          ? "12px 3px 12px 12px"
                          : "3px 12px 12px 12px",
                      bgcolor: msg.role === "user" ? c.userBubble : c.botBubble,
                      color:
                        msg.role === "user"
                          ? muiTheme.palette.primary.contrastText
                          : c.text,
                      border:
                        msg.role === "assistant"
                          ? `1px solid ${c.border}`
                          : "none",
                      boxShadow: "none",
                    }}
                  >
                    {msg.role === "assistant" &&
                    streaming &&
                    msg.content === "" ? (
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <CircularProgress size={10} thickness={5} />
                        <Typography variant="caption" sx={{ color: c.subText }}>
                          Thinking…
                        </Typography>
                      </Box>
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.6,
                          fontSize: "0.8rem",
                        }}
                      >
                        {msg.content}
                        {msg.role === "assistant" &&
                          streaming &&
                          i === messages.length - 1 &&
                          msg.content !== "" && (
                            <Box
                              component="span"
                              sx={{
                                display: "inline-block",
                                width: "2px",
                                height: "0.9em",
                                bgcolor: "currentColor",
                                ml: "2px",
                                verticalAlign: "text-bottom",
                                animation: "blink 1s step-end infinite",
                                "@keyframes blink": {
                                  "0%, 100%": { opacity: 1 },
                                  "50%": { opacity: 0 },
                                },
                              }}
                            />
                          )}
                      </Typography>
                    )}
                    {!streaming && (
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          mt: 0.25,
                          opacity: 0.45,
                          fontSize: "0.62rem",
                          textAlign: msg.role === "user" ? "left" : "right",
                        }}
                      >
                        {formatTime(msg.ts)}
                      </Typography>
                    )}
                  </Paper>
                </motion.div>
              ))}

              <div ref={bottomRef} />
            </Box>

            {/* Input */}
            <Box
              sx={{
                flexShrink: 0,
                px: 1.5,
                py: 1.25,
                borderTop: `1px solid ${c.border}`,
                bgcolor: c.surfaceBg,
              }}
            >
              <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                <TextField
                  inputRef={inputRef}
                  fullWidth
                  multiline
                  maxRows={3}
                  size="small"
                  placeholder="Ask about leaves, salary, policies…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={streaming}
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                  sx={{ "& .MuiInputBase-input": { fontSize: "0.82rem" } }}
                />
                <IconButton
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || streaming}
                  size="small"
                  sx={{
                    bgcolor:
                      input.trim() && !streaming ? c.brand : "transparent",
                    color: input.trim() && !streaming ? "#fff" : c.subText,
                    borderRadius: 1.5,
                    transition: "background-color 0.15s ease, color 0.15s ease",
                    "&:hover": {
                      bgcolor:
                        input.trim() && !streaming ? c.brandHover : undefined,
                    },
                  }}
                >
                  {streaming ? (
                    <CircularProgress size={16} thickness={5} />
                  ) : (
                    <SendIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </Box>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAB ── */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 1300,
            }}
          >
            <Fab
              onClick={() => setOpen(true)}
              aria-label="Open HRMS AI Assistant"
              sx={{
                bgcolor: c.brand,
                color: "#fff",
                boxShadow: c.fabShadow,
                "&:hover": { bgcolor: c.brandHover },
              }}
            >
              <SmartToyIcon sx={{ color: "#fff" }} />
            </Fab>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
