// The film's title and info screens, as HTML at 1920×1080. Motion is plain
// CSS animation; film.mjs pauses every animation and steps its currentTime
// one frame at a time, so the capture is exact at 30 fps however long a
// screenshot takes. Times are seconds from the card's first frame; `marks`
// are when each narration line starts, so a card's second beat lands on its
// second line.
//
// Look: the landing page's midnight surface, the accent blue, the Praesto
// mark's three colours, and the system display face (SF Pro on macOS), as in
// the app.
import { readFileSync } from "node:fs";

const ICONS = JSON.parse(
  readFileSync(new URL("./icons.json", import.meta.url), "utf8"),
);
const icon = (id, size = 28) =>
  ICONS[id]
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`)
    .replace(/ style="[^"]*"/, "");

const MARK = [
  ["M 63.5,81.4 L 64.5,34.7 L 72.1,44.3", "#fd7624"],
  ["M 63.3,82.2 L 91.3,57.2", "#f03933"],
  ["M 75.5,57.0 L 102.7,27.5 L 102.7,72.0 L 95.7,65.0", "#25b37b"],
];
/** The Praesto mark; `draw` animates its strokes in from `at`. */
export const mark = (h, at = null) =>
  `<svg viewBox="58 22 50 66" width="${(h * 50) / 66}" height="${h}" fill="none" stroke-width="5.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MARK.map(
    ([d, c], i) =>
      `<path d="${d}" stroke="${c}" pathLength="1"${at === null ? "" : ` class="draw" style="--d:${(at + i * 0.18).toFixed(2)}s"`}/>`,
  ).join("")}</svg>`;

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/** A line that rises out of its own slot. */
const line = (text, d, cls = "") =>
  `<span class="mask ${cls}"><span style="--d:${d}s">${esc(text)}</span></span>`;

const BASE = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden}
body{position:relative;background:#070d13;color:#fff;
  font-family:-apple-system,"SF Pro Display",BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;font-feature-settings:"ss01"}
.bg{position:absolute;inset:0;background:
  radial-gradient(1300px 900px at 15% 0%,#10243a 0%,transparent 62%),
  radial-gradient(1100px 800px at 100% 100%,#0b1e2e 0%,transparent 60%),#070d13}
.aurora i{position:absolute;border-radius:50%;filter:blur(130px);animation:drift 16s ease-in-out infinite alternate both}
.aurora i:nth-child(1){width:900px;height:620px;left:-260px;top:-220px;background:#1d5fae;opacity:.5}
.aurora i:nth-child(2){width:720px;height:520px;right:-200px;top:260px;background:#0f7a57;opacity:.28;animation-duration:21s}
.aurora i:nth-child(3){width:640px;height:420px;left:560px;bottom:-300px;background:#b5541a;opacity:.2;animation-duration:25s}
@keyframes drift{to{transform:translate(140px,90px) scale(1.18)}}
.mask{display:block;overflow:hidden;padding:0 .04em .1em;margin-bottom:-.1em}
.mask>span{display:block;animation:up 1.05s cubic-bezier(.2,.75,.1,1) both;animation-delay:var(--d,0s)}
@keyframes up{from{transform:translateY(108%)}}
.rise{animation:rise .9s cubic-bezier(.2,.75,.1,1) both;animation-delay:var(--d,0s)}
@keyframes rise{from{opacity:0;transform:translateY(26px)}}
.fade{animation:fade .8s ease both;animation-delay:var(--d,0s)}
@keyframes fade{from{opacity:0}}
.out{animation:out .6s ease forwards;animation-delay:var(--d,0s)}
@keyframes out{to{opacity:0;transform:translateY(-18px)}}
.pop{animation:pop .75s cubic-bezier(.2,.8,.25,1.25) both;animation-delay:var(--d,0s)}
@keyframes pop{from{opacity:0;scale:.82}}
.draw{stroke-dasharray:1;animation:draw .75s cubic-bezier(.6,0,.2,1) both;animation-delay:var(--d,0s)}
@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.kicker{font:600 22px/1 inherit;letter-spacing:.2em;text-transform:uppercase;color:#7fb2ee}
.muted{color:#a6b4c3}
.tile{display:grid;place-items:center;border-radius:22px;background:linear-gradient(160deg,#2a78d6,#1b4f93);
  box-shadow:inset 0 1px 0 rgb(255 255 255 / .18),0 18px 40px -18px rgb(42 120 214 / .8);color:#fff}
.glass{background:linear-gradient(180deg,rgb(255 255 255 / .075),rgb(255 255 255 / .035));
  border:1px solid rgb(255 255 255 / .1);border-radius:24px;backdrop-filter:blur(8px);
  box-shadow:0 30px 80px -40px rgb(0 0 0 / .8)}
`;

const page = (css, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${css}</style></head><body><div class="bg"></div><div class="aurora"><i></i><i></i><i></i></div>${body}</body></html>`;

// ── Opening: the mark draws, the name and the brand line rise ─────────────
export function open() {
  return page(
    `main{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;text-align:center}
     .word{font-size:168px;font-weight:650;letter-spacing:-.045em;line-height:1;margin-top:36px}
     .tag{margin-top:34px;font-size:50px;font-weight:500;letter-spacing:-.015em;line-height:1.18;color:#b9c6d3}
     .glow{position:absolute;left:50%;top:44%;width:520px;height:520px;margin:-260px;border-radius:50%;
       background:radial-gradient(circle,rgb(42 120 214 / .35),transparent 65%);animation:fade 1.6s ease both .2s}`,
    `<div class="glow"></div><main>
      ${mark(176, 0.25)}
      <h1 class="word">${line("Praesto", 1.05)}</h1>
      <p class="tag">${line("People operations,", 1.6)}${line("beautifully connected.", 1.75)}</p>
    </main>`,
  );
}

// ── Pitch: six jobs in six places, then one workspace ──────────────────────
const JOBS = [
  ["Attendance", "attendance", "Punches, hours, corrections"],
  ["Leave", "leave-management", "Requests and balances"],
  ["Payroll", "payroll", "Runs and payslips"],
  ["Hiring", "recruitment", "Openings and interviews"],
  ["Reviews", "performance", "Review cycles"],
  ["Helpdesk", "workplace", "Tickets and answers"],
];
export function pitch({ marks }) {
  const t1 = (marks[1] ?? 6) - 0.2;
  const scatter = [
    [190, 470, -6],
    [1380, 330, 5],
    [740, 560, 3],
    [1230, 690, -4],
    [330, 800, 4],
    [1470, 870, -5],
  ];
  const W = 340,
    H = 104,
    G = 28;
  const gx = 960 - (3 * W + 2 * G) / 2,
    gy = 560;
  const chips = JOBS.map(([name, mod, sub], i) => {
    const [x1, y1, r1] = scatter[i];
    const x2 = gx + (i % 3) * (W + G),
      y2 = gy + Math.floor(i / 3) * (H + G);
    return `<div class="chip glass" style="--x1:${x1}px;--y1:${y1}px;--r1:${r1}deg;--x2:${x2}px;--y2:${y2}px;--d:${(0.5 + i * 0.28).toFixed(2)}s;--g:${(t1 + 0.05 * i).toFixed(2)}s">
      <span class="tile" style="width:60px;height:60px;border-radius:16px">${icon(mod, 30)}</span>
      <span><b>${name}</b><small>${sub}</small></span></div>`;
  }).join("");
  return page(
    `.chip{position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:flex;align-items:center;gap:20px;padding:0 24px;
       translate:var(--x1) var(--y1);rotate:var(--r1);
       animation:pop .75s cubic-bezier(.2,.8,.25,1.25) both var(--d),gather 1.2s cubic-bezier(.65,0,.25,1) forwards var(--g)}
     @keyframes gather{to{translate:var(--x2) var(--y2);rotate:0deg}}
     .chip b{display:block;font-size:30px;font-weight:650;letter-spacing:-.01em}
     .chip small{display:block;margin-top:6px;font-size:20px;color:#9fb0c1}
     h2{position:absolute;left:160px;top:150px;font-size:84px;font-weight:680;letter-spacing:-.035em;line-height:1.05}
     .h2b{top:150px}
     .panel{position:absolute;left:${gx - 48}px;top:${gy - 132}px;width:${3 * W + 2 * G + 96}px;height:${2 * H + G + 180}px;
       border-radius:34px;animation:panel 1s cubic-bezier(.2,.75,.1,1) both;animation-delay:${(t1 + 0.35).toFixed(2)}s}
     @keyframes panel{from{opacity:0;scale:.94}}
     .panel header{display:flex;align-items:center;gap:16px;padding:30px 44px;font-size:34px;font-weight:650;letter-spacing:-.02em}
     .panel header em{margin-left:auto;font-style:normal;font-size:20px;font-weight:500;color:#9fb0c1}`,
    `<h2 class="out" style="--d:${(t1 - 0.3).toFixed(2)}s">${line("Spread across", 0.15)}${line("too many places.", 0.28)}</h2>
     <h2 class="h2b">${line("One workspace", t1 + 0.25)}${line("for all of it.", t1 + 0.4)}</h2>
     <div class="panel glass"><header>${mark(46)} Praesto <em>Set up to your rules · Access by role</em></header></div>
     ${chips}`,
  );
}

// ── Agenda: the twelve parts ───────────────────────────────────────────────
export function agenda({ modules, minutes }) {
  const tiles = modules
    .map(
      (m, i) => `<li class="glass pop" style="--d:${(1.0 + i * 0.09).toFixed(2)}s">
        <span class="tile" style="width:64px;height:64px;border-radius:18px">${icon(m.id, 32)}</span>
        <small>${String(i + 1).padStart(2, "0")}</small><b>${esc(m.title)}</b></li>`,
    )
    .join("");
  return page(
    `header{position:absolute;left:160px;top:120px}
     h2{font-size:96px;font-weight:680;letter-spacing:-.04em;line-height:1.02}
     header p{margin-top:22px;font-size:34px}
     ul{position:absolute;left:160px;right:160px;top:500px;display:grid;grid-template-columns:repeat(6,1fr);gap:24px;list-style:none}
     li{height:228px;padding:26px;display:flex;flex-direction:column;align-items:flex-start;gap:0}
     li small{margin-top:auto;font-size:20px;font-weight:600;color:#7fb2ee;letter-spacing:.08em}
     li b{margin-top:8px;font-size:27px;font-weight:620;letter-spacing:-.01em;line-height:1.15}`,
    `<header><p class="kicker fade" style="--d:.1s">The complete tour</p>
       <h2 style="margin-top:22px">${line("Every part of Praesto,", 0.2)}${line("in one sitting.", 0.34)}</h2>
       <p class="muted rise" style="--d:.7s">${modules.length} parts · about ${minutes} minutes · recorded in the real product</p></header>
     <ul>${tiles}</ul>`,
  );
}

// ── Section: one module, what's in it, where we are ────────────────────────
export function section({ module, index, of, highlights }) {
  const n = String(index).padStart(2, "0");
  const rows = highlights
    .map(
      (h, i) => `<li class="rise" style="--d:${(1.0 + i * 0.16).toFixed(2)}s">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7fd19b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>${esc(h)}</li>`,
    )
    .join("");
  const steps = Array.from(
    { length: of },
    (_, i) =>
      `<i class="${i + 1 < index ? "done" : i + 1 === index ? "now" : ""}"></i>`,
  ).join("");
  return page(
    `.num{position:absolute;right:90px;bottom:-120px;font-size:620px;font-weight:800;letter-spacing:-.06em;line-height:1;
       color:transparent;-webkit-text-stroke:2px rgb(255 255 255 / .07);animation:numIn 1.6s cubic-bezier(.2,.75,.1,1) both}
     @keyframes numIn{from{opacity:0;transform:translateY(60px)}}
     .left{position:absolute;left:160px;top:200px;width:880px}
     .left .tile{width:104px;height:104px;border-radius:28px;margin-bottom:46px}
     h2{margin-top:22px;font-size:124px;font-weight:700;letter-spacing:-.045em;line-height:1}
     .desc{margin-top:34px;font-size:36px;line-height:1.38;letter-spacing:-.005em}
     .card{position:absolute;left:1160px;top:250px;width:600px;padding:40px 44px}
     .card .kicker{font-size:19px;color:#9fb0c1}
     .card ul{list-style:none;margin-top:26px;display:grid;gap:22px}
     .card li{display:flex;gap:16px;align-items:flex-start;font-size:30px;font-weight:550;letter-spacing:-.01em;line-height:1.2}
     .card li svg{flex:none;margin-top:3px}
     .steps{position:absolute;left:160px;right:160px;bottom:90px;display:grid;grid-template-columns:repeat(${of},1fr);gap:10px}
     .steps i{height:6px;border-radius:3px;background:rgb(255 255 255 / .12)}
     .steps i.done{background:rgb(127 178 238 / .55)}
     .steps i.now{background:linear-gradient(90deg,#4a8fe0,#7fb2ee);transform-origin:left;animation:grow 1.2s cubic-bezier(.2,.75,.1,1) both .4s}
     @keyframes grow{from{transform:scaleX(0)}}`,
    `<div class="num">${n}</div>
     <div class="left">
       <span class="tile pop" style="--d:.05s">${icon(module.id, 54)}</span>
       <p class="kicker fade" style="--d:.25s">Part ${n} of ${of}</p>
       <h2>${line(module.title, 0.3)}</h2>
       <p class="desc muted rise" style="--d:.65s">${esc(module.description)}</p>
     </div>
     <div class="card glass rise" style="--d:.8s"><p class="kicker">In this part</p><ul>${rows}</ul></div>
     <div class="steps fade" style="--d:.2s">${steps}</div>`,
  );
}

// ── The frame a recorded clip plays in (a still; the video is laid over) ───
export const FRAME = { x: 160, y: 108, w: 1600, h: 900, bar: 40 };
export function frame({ module, title, index, of }) {
  const { x, y, w, h, bar } = FRAME;
  return page(
    `.aurora i{animation:none}
     .win{position:absolute;left:${x}px;top:${y - bar}px;width:${w}px;height:${h + bar}px;border-radius:16px;background:#000;
       box-shadow:0 0 0 1px rgb(255 255 255 / .08),0 50px 140px -30px rgb(0 0 0 / .85),0 0 120px -20px rgb(42 120 214 / .35)}
     .bar{height:${bar}px;display:flex;align-items:center;justify-content:center;gap:10px;position:relative;
       border-radius:16px 16px 0 0;background:linear-gradient(#1d2a37,#16212c);border-bottom:1px solid rgb(255 255 255 / .06);
       font-size:17px;font-weight:550;color:#c9d4df;letter-spacing:.005em}
     .bar svg{color:#7fb2ee}
     .dots{position:absolute;left:18px;display:flex;gap:8px}
     .dots i{width:12px;height:12px;border-radius:50%;background:#3a4754}
     .bar span{color:#8a9bac;font-weight:500}
     footer{position:absolute;left:${x}px;right:${1920 - x - w}px;bottom:0;height:${1080 - y - h}px;display:flex;align-items:center;gap:12px;
       font-size:20px;font-weight:600;letter-spacing:-.01em;color:#dfe7ee}
     footer em{margin-left:auto;font-style:normal;font-weight:500;color:#8a9bac}`,
    `<div class="win"><div class="bar"><div class="dots"><i></i><i></i><i></i></div>${icon(module.id, 18)} ${esc(module.title)} <span>·</span> ${esc(title)}</div></div>
     <footer>${mark(26)} Praesto <em>Part ${String(index).padStart(2, "0")} of ${of} · ${esc(module.title)}</em></footer>`,
  );
}
/** White where the video shows, with the window's rounded lower corners. */
export function frameMask() {
  const { w, h } = FRAME;
  return `<!doctype html><html><head><style>*{margin:0}html,body{width:${w}px;height:${h}px;background:#000}
    div{width:${w}px;height:${h}px;background:#fff;border-radius:0 0 16px 16px}</style></head><body><div></div></body></html>`;
}

// ── Outro: the line, then how to try it ────────────────────────────────────
export function outro({ marks }) {
  const t1 = (marks[1] ?? 4) - 0.1;
  return page(
    `main{position:absolute;left:160px;top:210px}
     h2{font-size:118px;font-weight:700;letter-spacing:-.045em;line-height:1.02}
     .cta{position:absolute;left:160px;top:640px;display:flex;align-items:center;gap:36px}
     .btn{display:inline-flex;align-items:center;gap:14px;height:92px;padding:0 44px;border-radius:999px;background:#2a78d6;
       font-size:36px;font-weight:650;letter-spacing:-.01em;box-shadow:0 20px 50px -20px rgb(42 120 214 / .9)}
     .url{font-size:56px;font-weight:650;letter-spacing:-.03em}
     .again{position:absolute;left:160px;top:800px;font-size:30px}
     .side{position:absolute;right:200px;top:560px;opacity:.9}`,
    `<main><p class="kicker fade" style="--d:.1s">That’s Praesto</p>
       <h2 style="margin-top:26px">${line("Everything your people need.", 0.25)}${line("In one place.", 0.42)}</h2></main>
     <div class="side fade" style="--d:.5s">${mark(260, 0.4)}</div>
     <div class="cta"><span class="btn pop" style="--d:${t1.toFixed(2)}s">Start your 14-day free trial
       <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
       <span class="url rise" style="--d:${(t1 + 0.25).toFixed(2)}s">praesto.in</span></div>
     <p class="again muted rise" style="--d:${(t1 + 0.6).toFixed(2)}s">Watch any part again at praesto.in/product-demo</p>`,
  );
}

// ── End: the lockup ────────────────────────────────────────────────────────
export function end() {
  return page(
    `main{position:absolute;inset:0;display:grid;place-content:center;justify-items:center}
     .lock{display:flex;align-items:center;gap:34px;font-size:120px;font-weight:650;letter-spacing:-.045em}
     p{margin-top:40px;font-size:34px;letter-spacing:.02em}`,
    `<main><div class="lock">${mark(130, 0.1)}${line("Praesto", 0.55)}</div>
       <p class="muted fade" style="--d:1.1s">praesto.in</p></main>`,
  );
}

// ── Thumbnail (1280×720, scaled from 1920×1080) ────────────────────────────
export function thumbnail({ shot, minutes }) {
  return page(
    `.shot{position:absolute;left:1000px;top:190px;width:1180px;border-radius:22px;overflow:hidden;rotate:-4deg;
       box-shadow:0 0 0 2px rgb(255 255 255 / .1),0 60px 140px -30px rgb(0 0 0 / .9),0 0 160px rgb(42 120 214 / .45)}
     .shot img{display:block;width:100%}
     main{position:absolute;z-index:1;left:120px;top:140px;width:860px}
     .lock{display:flex;align-items:center;gap:22px;font-size:64px;font-weight:650;letter-spacing:-.04em}
     h1{margin-top:50px;font-size:136px;font-weight:800;letter-spacing:-.055em;line-height:.98;text-shadow:0 6px 40px rgb(7 13 19 / .8)}
     h1 span{color:#7fb2ee}
     .pill{display:inline-block;margin-top:56px;padding:18px 34px;border-radius:999px;background:#2a78d6;font-size:40px;font-weight:700}`,
    `<div class="shot"><img src="${shot}"></div>
     <main><div class="lock">${mark(80)} Praesto</div>
       <h1>The<br><span>complete</span><br>tour</h1>
       <span class="pill">All 12 parts · ${minutes} min</span></main>`,
  );
}
