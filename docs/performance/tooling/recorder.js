// Playwright MCP (browser_run_code_unsafe) snippet: attaches a context-level
// recorder for /api/v1/ requests. State lives on the BrowserContext because
// each run_code call gets a fresh global scope. Never logs headers or bodies.
async (page) => {
  const ctx = page.context();
  if (ctx.__perf) return "already attached: " + ctx.__perf.rows.length;
  const perf = (ctx.__perf = {
    rows: [],
    label: { module: "init", page: "init" },
    pending: new Map(),
  });
  const isApi = (u) => /\/api\/v1\//.test(u);
  ctx.on("request", (req) => {
    if (isApi(req.url()))
      perf.pending.set(req, { wall: Date.now(), label: { ...perf.label } });
  });
  const record = async (req, failed) => {
    const p = perf.pending.get(req);
    if (!p) return;
    const t = req.timing();
    let size = null,
      status = null,
      cache = "network",
      st = null;
    try {
      const s = await req.sizes();
      size = s.responseBodySize;
    } catch {}
    try {
      const r = await req.response();
      if (r) {
        status = r.status();
        const h = await r.allHeaders();
        if (r.fromServiceWorker()) cache = "service-worker";
        if (h["x-cache"]) cache = h["x-cache"];
        st = h["server-timing"] || null;
      }
    } catch {}
    perf.pending.delete(req);
    const u = new URL(req.url());
    perf.rows.push({
      ts: new Date(p.wall).toISOString(),
      wall: p.wall,
      module: p.label.module,
      page: p.label.page,
      pass: p.label.pass,
      method: req.method(),
      path: u.pathname,
      query: u.search,
      status: failed ? "failed" : status,
      duration: t.responseEnd >= 0 ? t.responseEnd : null,
      ttfb:
        t.responseStart >= 0 && t.requestStart >= 0
          ? t.responseStart - t.requestStart
          : null,
      download:
        t.responseEnd >= 0 && t.responseStart >= 0
          ? t.responseEnd - t.responseStart
          : null,
      queue: t.requestStart,
      size,
      cache,
      serverTiming: st,
    });
  };
  ctx.on("requestfinished", (r) => record(r, false));
  ctx.on("requestfailed", (r) => record(r, true));
  return "attached";
};
