"""Summarise a targeted-bench run, joined with server timing log lines.

    python3 targeted-analyze.py <tag> <bench-json-dir> [gateway-log] [services-log]

The logs are `docker logs` output of the gateway / services captured after the
run; only lines whose requestId starts with tb-<tag>- are used. Prints
per-endpoint/phase client latency (n, median, p95, p99, max), status
distribution, bytes, and server-side medians (total, middleware, queries,
dbMs, dbBusyMs, maxInFlight, downstream).
"""
import json, re, statistics, sys, collections

def pct(v, q):
    v = sorted(v)
    if not v: return None
    k = (len(v) - 1) * q; f = int(k); c = min(f + 1, len(v) - 1)
    return v[f] + (v[c] - v[f]) * (k - f)

def logs(path, msg):
    out = {}
    if not path: return out
    for line in open(path, errors="replace"):
        line = re.sub(r"\x1b\[[0-9;]*m", "", line)
        if msg not in line: continue
        m = re.search(r"(\{.*\})\s*$", line)
        if not m: continue
        try: d = json.loads(m.group(1))
        except Exception: continue
        rid = d.get("requestId")
        if rid: out.setdefault(rid, []).append(d)
    return out

tag, d = sys.argv[1], sys.argv[2]
data = json.load(open(f"{d}/targeted-{tag}.json"))
gw = logs(sys.argv[3] if len(sys.argv) > 3 else None, "request timing")
gw.update({k: v for k, v in logs(sys.argv[3] if len(sys.argv) > 3 else None, "db-heavy request").items()})
svc = logs(sys.argv[4] if len(sys.argv) > 4 else None, "grpc timing")
refresh = []
if len(sys.argv) > 4:
    for line in open(sys.argv[4], errors="replace"):
        if "refresh timing" in line:
            m = re.search(r"(\{.*\})\s*$", re.sub(r"\x1b\[[0-9;]*m", "", line))
            if m:
                try: refresh.append(json.loads(m.group(1)))
                except Exception: pass

cold = [c["ms"] for c in data["cold"] if c["ms"] is not None]
print(f"refresh-token (cold page loads): n={len(cold)} median={statistics.median(cold):.0f} "
      f"p95={pct(cold,.95):.0f} max={max(cold):.0f} statuses={collections.Counter(c['status'] for c in data['cold'])}" if cold else "refresh-token: no samples")
if refresh:
    for k in ("verifyAndSignMs", "redisMs", "mongoMs", "totalMs"):
        v = [r[k] for r in refresh if k in r]
        print(f"   auth-service {k}: median={statistics.median(v):.0f} max={max(v):.0f} (n={len(v)}, all refreshes in log window)")

groups = collections.defaultdict(list)
for r in data["rows"]:
    groups[(r["phase"], r["name"])].append(r)
med = lambda v: round(statistics.median(v)) if v else None
for (phase, name), rs in sorted(groups.items()):
    if phase in ("warmup", "conditional-seed"): continue
    ms = [r["ms"] for r in rs if r["status"] > 0]
    st = collections.Counter(r["status"] for r in rs)
    srv = [x for r in rs for x in gw.get(r["rid"], [])]
    s = lambda k: med([x[k] for x in srv if isinstance(x.get(k), (int, float))])
    down = [y for r in rs for y in svc.get(r["rid"], [])]
    print(f"{phase:12} {name:20} n={len(rs):3} med={med(ms)} p95={round(pct(ms,.95) or 0)} p99={round(pct(ms,.99) or 0)} "
          f"max={round(max(ms)) if ms else None} status={dict(st)} bytes={med([r['bytes'] for r in rs])} | server n={len(srv)} "
          f"total={s('totalMs')} mw={s('middlewareMs')} q={s('queries')} dbMs={s('dbMs')} busy={s('dbBusyMs')} "
          f"inflight={s('maxInFlight')} grpc={s('downstreamMs')} | svc q={med([y['queries'] for y in down])} svcDb={med([y['dbMs'] for y in down])}")
