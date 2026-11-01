// Read-only: ping and a trivial indexed read, serial vs concurrent. Prints timings only.
const { master, forDb } = require("./common");
const pct = (v, q) => {
  v = [...v].sort((a, b) => a - b);
  const k = (v.length - 1) * q,
    f = Math.floor(k),
    c = Math.min(f + 1, v.length - 1);
  return Math.round(v[f] + (v[c] - v[f]) * (k - f));
};
const stat = (v) => ({
  n: v.length,
  med: pct(v, 0.5),
  p95: pct(v, 0.95),
  max: Math.round(Math.max(...v)),
});
(async () => {
  const m = await master();
  const c = forDb(process.argv[2] || "hrms-acme-corp");
  const time = async (f) => {
    const t = performance.now();
    await f();
    return performance.now() - t;
  };
  const ping = () => c.$runCommandRaw({ ping: 1 });
  const read = () =>
    c.$runCommandRaw({
      find: "tenant_settings",
      filter: {},
      projection: { _id: 1 },
      limit: 1,
    });
  for (let i = 0; i < 5; i++) await ping(); // warm the pool
  const out = {};
  for (const [name, f] of [
    ["ping", ping],
    ["read", read],
  ]) {
    const serial = [];
    for (let i = 0; i < 20; i++) serial.push(await time(f));
    out[name + " serial"] = stat(serial);
    for (const k of [10, 40]) {
      const all = [];
      for (let r = 0; r < 5; r++)
        all.push(
          ...(await Promise.all(Array.from({ length: k }, () => time(f)))),
        );
      out[`${name} x${k} concurrent`] = stat(all);
    }
  }
  console.log(JSON.stringify(out));
  await c.$disconnect();
  await m.$disconnect();
})().catch((e) => {
  console.error(
    "ERR",
    e.message.replace(/mongodb(\+srv)?:\/\/[^\s"]+/g, "<uri>"),
  );
  process.exit(1);
});
