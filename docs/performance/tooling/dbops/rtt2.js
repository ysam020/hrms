// Read-only: per-round latency of 40 concurrent pings on a fresh client, then
// after the pool is warm, then capped at 8 in flight.
const { master, forDb } = require("./common");
const pct = (v, q) => {
  v = [...v].sort((a, b) => a - b);
  const k = (v.length - 1) * q,
    f = Math.floor(k),
    c = Math.min(f + 1, v.length - 1);
  return Math.round(v[f] + (v[c] - v[f]) * (k - f));
};
(async () => {
  const m = await master();
  const c = forDb("hrms-acme-corp");
  const time = async () => {
    const t = performance.now();
    await c.$runCommandRaw({ ping: 1 });
    return performance.now() - t;
  };
  await time();
  const rounds = [];
  for (let r = 0; r < 6; r++) {
    const t0 = performance.now();
    const v = await Promise.all(Array.from({ length: 40 }, time));
    rounds.push({
      round: r,
      med: pct(v, 0.5),
      p95: pct(v, 0.95),
      wall: Math.round(performance.now() - t0),
    });
    await new Promise((r) => setTimeout(r, 500));
  }
  // Same 40 pings, at most 8 in flight.
  const capped = [];
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    let i = 0;
    const v = [];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (i < 40) {
          i++;
          v.push(await time());
        }
      }),
    );
    capped.push({
      round: r,
      med: pct(v, 0.5),
      p95: pct(v, 0.95),
      wall: Math.round(performance.now() - t0),
    });
  }
  console.log(JSON.stringify({ unbounded40: rounds, capped8: capped }));
  await c.$disconnect();
  await m.$disconnect();
})().catch((e) => {
  console.error(
    "ERR",
    e.message.replace(/mongodb(\+srv)?:\/\/[^\s"]+/g, "<uri>"),
  );
  process.exit(1);
});
