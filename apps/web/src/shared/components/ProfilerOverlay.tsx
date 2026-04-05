import { useState } from "react";
import { createPortal } from "react-dom";

// ─── Analysis ────────────────────────────────────────────────────────────────

const LONG_TASK_MS = 50; // gap threshold to flag as a long task

function analyzeTrace(trace: any) {
  const { samples, stacks, frames, resources = [] } = trace;
  const n = samples.length;
  if (n === 0) return null;

  const duration = n >= 2 ? samples[n - 1].timestamp - samples[0].timestamp : 0;

  // Idle = samples whose call stack is empty
  const idleCount = samples.filter((s: any) => s.stackId == null).length;
  const activeCount = n - idleCount;

  // Self-time: only the leaf (innermost) frame of each sample
  const selfCounts: Record<string, number> = {};
  for (const s of samples) {
    if (s.stackId == null) continue;
    const st = stacks[s.stackId];
    if (!st) continue;
    selfCounts[st.frameId] = (selfCounts[st.frameId] || 0) + 1;
  }

  // Top self-time frames
  const topSelf = Object.entries(selfCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([fid, hits]) => {
      const f = frames[Number(fid)] || {};
      const url = f.resourceId != null ? resources[f.resourceId] || "" : "";
      // strip origin + query, keep only the path filename
      let src = "";
      try {
        const u = new URL(url);
        src = u.pathname.split("/").pop() || u.pathname;
      } catch {
        src = url.split("/").pop() || "";
      }
      return {
        name: f.name || "(anonymous)",
        hits,
        selfPct: ((hits / n) * 100).toFixed(1),
        src,
        line: f.line,
      };
    });

  // Long tasks: consecutive sample pairs with a gap > threshold
  const longTasks = [];
  for (let i = 1; i < n; i++) {
    const gap = samples[i].timestamp - samples[i - 1].timestamp;
    if (gap > LONG_TASK_MS) {
      longTasks.push({
        gapMs: Math.round(gap),
        atMs: Math.round(samples[i - 1].timestamp - samples[0].timestamp),
      });
    }
  }

  // Max call stack depth
  let maxDepth = 0;
  for (const s of samples) {
    if (s.stackId == null) continue;
    let depth = 0;
    let cur = s.stackId;
    while (cur != null) {
      depth++;
      const st = stacks[cur];
      if (!st) break;
      cur = st.parentId;
    }
    maxDepth = Math.max(maxDepth, depth);
  }

  // Script breakdown by self-time of leaf frame
  const byScript = { App: 0, Vendor: 0, Native: 0 };
  for (const s of samples) {
    if (s.stackId == null) continue;
    const st = stacks[s.stackId];
    if (!st) continue;
    const f = frames[st.frameId];
    const url = f && f.resourceId != null ? resources[f.resourceId] || "" : "";
    if (!url) byScript.Native++;
    else if (url.includes("node_modules") || url.includes("chunk"))
      byScript.Vendor++;
    else byScript.App++;
  }

  const avgRate = n >= 2 ? (duration / (n - 1)).toFixed(1) : "—";

  return {
    durationMs: Math.round(duration),
    idlePct: Math.round((idleCount / n) * 100),
    activePct: Math.round((activeCount / n) * 100),
    maxDepth,
    avgRate,
    topSelf,
    longTasks,
    byScript,
    totalSamples: n,
    activeCount,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const BORDER = "1px solid rgba(255,255,255,0.07)";
const SECTION_LABEL = {
  fontSize: 10,
  opacity: 0.4,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: 8,
};

function SectionLabel({ children }: { children: any }) {
  return <div style={SECTION_LABEL}>{children}</div>;
}

function StatCard({
  label,
  value,
  sub = undefined,
  highlight = undefined,
}: {
  label: any;
  value: any;
  sub?: any;
  highlight?: any;
}) {
  return (
    <div style={{ flex: 1, padding: "8px 4px", textAlign: "center" }}>
      <div
        style={{
          fontSize: 15,
          fontWeight: "bold",
          color: highlight || "#fff",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9, opacity: 0.4, marginTop: 2 }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 9, opacity: 0.3, marginTop: 1 }}>{sub}</div>
      )}
    </div>
  );
}

function Bar({
  pct,
  color = "#4a9eff",
  height = 4,
}: {
  pct: any;
  color?: string;
  height?: number;
}) {
  return (
    <div
      style={{
        height,
        background: "rgba(255,255,255,0.08)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: "100%",
          background: color,
          borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

const SCRIPT_COLORS: Record<string, string> = {
  App: "#4ade80",
  Vendor: "#facc15",
  Native: "#94a3b8",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProfilerOverlay({
  isActive,
  lastTrace,
  onClose,
}: {
  isActive: any;
  lastTrace: any;
  onClose: any;
}) {
  const [copied, setCopied] = useState(false);

  if (!isActive && !lastTrace) return null;

  const analysis = lastTrace ? analyzeTrace(lastTrace) : null;

  const handleCopy = () => {
    if (!analysis) return;
    const payload = {
      duration: `${(analysis.durationMs / 1000).toFixed(2)}s`,
      samples: analysis.totalSamples,
      activePct: `${analysis.activePct}%`,
      idlePct: `${analysis.idlePct}%`,
      avgRateMs: analysis.avgRate,
      maxDepth: analysis.maxDepth,
      longTasks: analysis.longTasks,
      topSelfFrames: analysis.topSelf,
      scriptBreakdown: analysis.byScript,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const overlay = (
    <>
      {/* Recording badge */}
      {isActive && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(20,20,20,0.9)",
            color: "#fff",
            padding: "6px 14px",
            borderRadius: 20,
            fontSize: 12,
            fontFamily: "monospace",
            zIndex: 2147483647,
            boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
            userSelect: "none",
            border: "1px solid rgba(255,80,80,0.3)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#f44",
              display: "inline-block",
              animation: "profiler-pulse 1s ease-in-out infinite",
            }}
          />
          Recording
          <span style={{ opacity: 0.45, fontSize: 11 }}>Alt+P to stop</span>
          <style>{`
            @keyframes profiler-pulse {
              0%,100% { opacity:1; transform:scale(1); }
              50%      { opacity:0.3; transform:scale(0.7); }
            }
          `}</style>
        </div>
      )}

      {/* Results panel */}
      {!isActive && analysis && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(860px, calc(100vw - 32px))",
            maxHeight: "60vh",
            overflowY: "auto",
            background: "rgba(14,14,16,0.97)",
            color: "#d4d4d8",
            borderRadius: 12,
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
            zIndex: 2147483647,
            fontFamily: "ui-monospace, 'Cascadia Code', monospace",
            fontSize: 12,
            border: BORDER,
            backdropFilter: "blur(12px)",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "11px 14px",
              borderBottom: BORDER,
              background: "rgba(255,255,255,0.03)",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <div>
              <span style={{ fontWeight: "bold", fontSize: 13, color: "#fff" }}>
                JS Profiler
              </span>
              <span
                style={{
                  marginLeft: 8,
                  opacity: 0.4,
                  fontSize: 11,
                }}
              >
                {(analysis.durationMs / 1000).toFixed(2)}s recorded
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={handleCopy}
                title={copied ? "Copied!" : "Copy results"}
                style={{
                  background: copied ? "rgba(74,222,128,0.12)" : "none",
                  border: "none",
                  color: copied ? "#4ade80" : "#666",
                  cursor: "pointer",
                  padding: "4px 6px",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  transition: "color 0.2s, background 0.2s",
                }}
                aria-label="Copy results"
              >
                {copied ? (
                  // checkmark
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  // clipboard
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="2" width="6" height="4" rx="1" />
                    <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
                    <line x1="9" y1="12" x2="15" y2="12" />
                    <line x1="9" y1="16" x2="13" y2="16" />
                  </svg>
                )}
              </button>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  color: "#666",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: "0 2px",
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div
            style={{
              display: "flex",
              borderBottom: BORDER,
            }}
          >
            <StatCard
              label="Samples"
              value={analysis.totalSamples.toLocaleString()}
            />
            <StatCard
              label="Active"
              value={`${analysis.activePct}%`}
              highlight={analysis.activePct > 80 ? "#f87171" : "#4ade80"}
            />
            <StatCard label="Idle" value={`${analysis.idlePct}%`} />
            <StatCard
              label="Avg rate"
              value={`${analysis.avgRate}ms`}
              sub="actual"
            />
            <StatCard label="Max depth" value={analysis.maxDepth} />
          </div>

          {/* ── Long tasks ── */}
          {analysis.longTasks.length > 0 && (
            <div
              style={{
                padding: "10px 14px",
                borderBottom: BORDER,
                background: "rgba(239,68,68,0.06)",
              }}
            >
              <SectionLabel>
                Long tasks ({analysis.longTasks.length}) — main thread blocked
                &gt;{LONG_TASK_MS}ms
              </SectionLabel>
              {analysis.longTasks.slice(0, 5).map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                    padding: "4px 8px",
                    background: "rgba(239,68,68,0.1)",
                    borderRadius: 4,
                    border: "1px solid rgba(239,68,68,0.2)",
                  }}
                >
                  <span style={{ color: "#fca5a5" }}>{t.gapMs}ms gap</span>
                  <span style={{ opacity: 0.45 }}>at +{t.atMs}ms</span>
                </div>
              ))}
              {analysis.longTasks.length > 5 && (
                <div style={{ opacity: 0.35, marginTop: 4 }}>
                  +{analysis.longTasks.length - 5} more — see console
                </div>
              )}
            </div>
          )}

          {/* ── Self-time hot frames ── */}
          <div style={{ padding: "10px 14px", borderBottom: BORDER }}>
            <SectionLabel>
              Self time — where CPU actually spent time (leaf frames)
            </SectionLabel>
            {analysis.topSelf.length === 0 ? (
              <div style={{ opacity: 0.35 }}>No active samples.</div>
            ) : (
              analysis.topSelf.map((f, i) => (
                <div
                  key={i}
                  style={{ marginBottom: 9 }}
                  title={`${f.name}${f.src ? ` (${f.src}${f.line ? `:${f.line}` : ""})` : ""} — ${f.hits} samples`}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 210,
                      }}
                    >
                      <span style={{ color: "#93c5fd" }}>{f.name}</span>
                      {f.src && (
                        <span style={{ opacity: 0.35, marginLeft: 5 }}>
                          {f.src}
                          {f.line ? `:${f.line}` : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ opacity: 0.6, flexShrink: 0, marginLeft: 6 }}>
                      {f.selfPct}%
                      <span style={{ opacity: 0.5, marginLeft: 4 }}>
                        ({f.hits})
                      </span>
                    </div>
                  </div>
                  <Bar pct={parseFloat(f.selfPct)} color="#4a9eff" height={3} />
                </div>
              ))
            )}
          </div>

          {/* ── Script breakdown ── */}
          <div style={{ padding: "10px 14px", borderBottom: BORDER }}>
            <SectionLabel>Script breakdown (self time)</SectionLabel>
            {Object.entries(analysis.byScript)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([label, hits]) => {
                const pct = ((hits / analysis.activeCount) * 100).toFixed(1);
                return (
                  <div key={label} style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{ color: SCRIPT_COLORS[label] || "#d4d4d8" }}
                      >
                        {label}
                      </span>
                      <span style={{ opacity: 0.55 }}>{pct}%</span>
                    </div>
                    <Bar
                      pct={parseFloat(pct)}
                      color={SCRIPT_COLORS[label] || "#d4d4d8"}
                      height={4}
                    />
                  </div>
                );
              })}
          </div>

          {/* ── Insight callouts ── */}
          {(() => {
            const notes = [];
            if (analysis.idlePct > 70)
              notes.push(
                "Mostly idle — try profiling during a specific user interaction.",
              );
            if (analysis.longTasks.length > 0)
              notes.push(
                `${analysis.longTasks.length} long task(s) detected — likely causing jank or delayed interactions.`,
              );
            if (
              analysis.byScript.Vendor > analysis.byScript.App &&
              analysis.byScript.App > 0
            )
              notes.push(
                "More CPU in vendor libraries than app code — check which library is hot above.",
              );
            if (analysis.byScript.Native > analysis.activeCount * 0.5)
              notes.push(
                "Over 50% native/unknown frames — browser internals or inlined code, possibly DOM/layout work.",
              );
            if (analysis.maxDepth > 30)
              notes.push(
                `Deep call stacks (max ${analysis.maxDepth}) — watch for unintended recursion.`,
              );
            if (notes.length === 0) return null;
            return (
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: BORDER,
                  background: "rgba(250,204,21,0.04)",
                }}
              >
                <SectionLabel>Insights</SectionLabel>
                {notes.map((n, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: i < notes.length - 1 ? 6 : 0,
                      color: "#fde68a",
                      lineHeight: 1.5,
                    }}
                  >
                    › {n}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </>
  );

  return createPortal(overlay, document.body);
}
