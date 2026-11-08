/**
 * Browser harness for the REAL web realtime stack: SocketProvider
 * (apps/web/.../SocketContext.tsx), UserContext, axiosConfig's token store
 * and reconnectPolicy, bundled unmodified and run in real Chromium against
 * the integration gateway processes. Only the page shell is test code: it
 * supplies the signed-in user + access token the app's login flow would.
 */
import { useContext, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { UserContext } from "@web/app/providers/UserContext";
import {
  SocketProvider,
  SocketContext,
} from "@web/app/providers/SocketContext";
import { setAccessToken, getAccessToken } from "@web/core/http/axiosConfig";

const q = new URLSearchParams(location.search);
const log: Array<{ t: number; ev: string; detail?: unknown }> = [];
const t0 = performance.now();
const push = (ev: string, detail?: unknown) =>
  log.push({ t: Math.round(performance.now() - t0), ev, detail });
(window as any).__log = log;
(window as any).__setToken = (t: string) => (
  setAccessToken(t),
  push("token-set")
);
(window as any).__getToken = getAccessToken;

// Count every socket.io Socket the app creates (duplicate-connection check).
setAccessToken(q.get("token")!);

// Module-level so the probe never double-registers when the context value
// changes (it does on every connected/disconnected render).
const seen = new WeakSet<object>();
let instances = 0;

function Probe() {
  const ctx = useContext(SocketContext)!;
  useEffect(() => {
    const id = setInterval(() => {
      const s: any = ctx.socketRef.current;
      if (!s || seen.has(s)) return;
      seen.add(s);
      instances++;
      push("socket-instance", instances);
      s.on("connect", () => push("connect", { id: s.id }));
      s.on("disconnect", (r: string) => push("disconnect", r));
      s.on("connect_error", (e: any) =>
        push("connect_error", {
          message: e?.message,
          code: e?.data?.code,
          retryable: e?.data?.retryable,
          active: s.active,
        }),
      );
      s.on("session-expired", () => push("session-expired"));
      s.on("it:ping", () => push("it:ping"));
      s.io.on("reconnect_attempt", (n: number) => push("reconnect_attempt", n));
      (window as any).__socket = s;
      (window as any).__instances = () => instances;
      (window as any).__listenerCounts = () => ({
        connect: s.listeners("connect").length,
        itPing: s.listeners("it:ping").length,
        disconnect: s.listeners("disconnect").length,
      });
    }, 10);
    return () => clearInterval(id);
  }, [ctx]);
  return <pre id="state">{ctx.connected ? "connected" : "disconnected"}</pre>;
}

createRoot(document.getElementById("root")!).render(
  <UserContext.Provider
    value={{
      user: { id: q.get("user") },
      setUser: () => {},
      handleLogout: () => push("logout"),
    }}
  >
    <SocketProvider>
      <Probe />
    </SocketProvider>
  </UserContext.Provider>,
);
