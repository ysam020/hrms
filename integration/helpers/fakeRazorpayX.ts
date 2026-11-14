/**
 * A local stand-in for the RazorpayX Payouts API, for integration suites.
 * Never talks to Razorpay: installFakeRazorpayX() redirects the process's
 * fetch() for api.razorpay.com to this server and REFUSES every other
 * non-local host, so a test can't reach a real payment endpoint even by
 * mistake.
 *
 * Payouts are idempotent per X-Payout-Idempotency key, which is how the
 * real API documents that header; behaviour per call is switchable:
 *   processing | processed | queued — created with that status
 *   reject           — HTTP 400, nothing created
 *   accept_then_drop — created, then the connection is cut before any
 *                      response (the caller can't tell it succeeded)
 */
import http from "node:http";
import { AddressInfo } from "node:net";

export type FakePayoutMode =
  | "processing"
  | "processed"
  | "queued"
  | "reject"
  | "accept_then_drop";

export interface FakePayout {
  id: string;
  status: string;
  amount: number;
  idempotencyKey: string;
  referenceId: string;
}

export interface FakeRazorpayX {
  mode: FakePayoutMode;
  /** One entry per distinct idempotency key = one real-world transfer. */
  payouts: Map<string, FakePayout>;
  /** Every POST /v1/payouts received, including idempotent repeats. */
  payoutRequests: number;
  reset(): void;
  close(): Promise<void>;
}

const LOCAL = new Set(["127.0.0.1", "localhost"]);

export async function installFakeRazorpayX(): Promise<FakeRazorpayX> {
  let seq = 0;
  const contacts = new Map<string, string>();
  const fake: FakeRazorpayX = {
    mode: "processing",
    payouts: new Map(),
    payoutRequests: 0,
    reset() {
      this.mode = "processing";
      this.payouts.clear();
      this.payoutRequests = 0;
      contacts.clear();
    },
    close: async () => {},
  };

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://fake");
      const body = raw ? JSON.parse(raw) : {};
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      if (req.method === "GET" && url.pathname === "/v1/contacts") {
        const ref = url.searchParams.get("reference_id") ?? "";
        const id = contacts.get(ref);
        return send(
          200,
          id ? { count: 1, items: [{ id }] } : { count: 0, items: [] },
        );
      }
      if (req.method === "POST" && url.pathname === "/v1/contacts") {
        const id = `cont_fake_${++seq}`;
        contacts.set(String(body.reference_id), id);
        return send(200, { id });
      }
      if (req.method === "POST" && url.pathname === "/v1/fund_accounts") {
        return send(200, { id: `fa_fake_${++seq}` });
      }
      if (req.method === "POST" && url.pathname === "/v1/payouts") {
        fake.payoutRequests++;
        const key = String(req.headers["x-payout-idempotency"] ?? "");
        if (fake.mode === "reject") {
          return send(400, { error: { description: "Fake rejection" } });
        }
        let payout = fake.payouts.get(key);
        if (!payout) {
          payout = {
            id: `pout_fake_${++seq}`,
            status: fake.mode === "accept_then_drop" ? "processing" : fake.mode,
            amount: body.amount,
            idempotencyKey: key,
            referenceId: body.reference_id,
          };
          fake.payouts.set(key, payout);
        }
        if (fake.mode === "accept_then_drop") {
          req.socket.destroy();
          return;
        }
        return send(200, { id: payout.id, status: payout.status });
      }
      send(404, {
        error: { description: `fake: no route ${req.method} ${url.pathname}` },
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "api.razorpay.com") {
      return realFetch(
        `http://127.0.0.1:${port}${url.pathname}${url.search}`,
        init,
      );
    }
    if (!LOCAL.has(url.hostname)) {
      throw new Error(
        `fake RazorpayX: refusing non-local fetch to ${url.hostname}`,
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;

  fake.close = async () => {
    globalThis.fetch = realFetch;
    await new Promise<void>((r) => server.close(() => r()));
  };
  return fake;
}
