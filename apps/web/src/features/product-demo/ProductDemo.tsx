import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { Icon, type IconName } from "@next/ui";
import { trackEvent } from "@next/app/analytics";
import { Arrow, Footer, NavBar, Roll } from "../landing/SiteChrome";
import landing from "../landing/landing.module.css";
import {
  CDN_CONFIGURED,
  MODULES,
  cdn,
  chapterAt,
  clock,
  findVideo,
  type DemoModule,
  type DemoVideo,
} from "./catalogue";
import { HlsPlayer, PlayGlyph, type PlayerHandle } from "./HlsPlayer";
import s from "./productDemo.module.css";

/**
 * /product-demo: short recordings of the real product, by module. Public,
 * no sign-in. The catalogue is static (catalogue.ts), so the page's text and
 * video list are prerendered for search engines; the player fetches nothing
 * until a visitor presses play. ?v=<video id> opens a specific demo.
 */
export default function ProductDemo() {
  const { user } = useContext(UserContext);
  const signedIn = Boolean(user);
  const [params, setParams] = useSearchParams();
  const initial = findVideo(params.get("v")) ?? {
    module: MODULES[0],
    video: MODULES[0].videos[0],
  };
  const [moduleId, setModuleId] = useState(initial.module.id);
  const [videoId, setVideoId] = useState(initial.video.id);
  const [time, setTime] = useState(0);
  const [overDark, setOverDark] = useState(true);
  const player = useRef<PlayerHandle>(null);
  const theatreRef = useRef<HTMLDivElement>(null);

  const mod = MODULES.find((m) => m.id === moduleId) ?? MODULES[0];
  const video = mod.videos.find((v) => v.id === videoId) ?? mod.videos[0];
  const active = chapterAt(video.chapters, time);

  // Keep ?v= in step, so a demo can be shared (the canonical URL stays
  // /product-demo).
  useEffect(() => {
    if (params.get("v") === video.id) return;
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("v", video.id);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [video.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The bar is dark over the hero and the closing section, light elsewhere.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const dark = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) dark.add(e.target);
          else dark.delete(e.target);
        }
        setOverDark(dark.size > 0);
      },
      { rootMargin: `0px 0px ${32 - window.innerHeight}px 0px` },
    );
    document
      .querySelectorAll("[data-nav-dark]")
      .forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const select = useCallback((m: DemoModule, v?: DemoVideo) => {
    setModuleId(m.id);
    setVideoId((v ?? m.videos[0]).id);
    setTime(0);
  }, []);

  /** Choose a video and start it, bringing the player into view. */
  const watch = useCallback(
    (m: DemoModule, v: DemoVideo) => {
      select(m, v);
      theatreRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      // After the player has the new video.
      requestAnimationFrame(() => player.current?.seek(0));
    },
    [select],
  );

  const related = useMemo(() => {
    const same = mod.videos.filter((v) => v.id !== video.id);
    const others = MODULES.filter((m) => m.id !== mod.id).map(
      (m) => m.videos[0],
    );
    return [...same, ...others].map((v) => ({
      video: v,
      module: findVideo(v.id)!.module,
    }));
  }, [mod, video.id]);

  const totalVideos = MODULES.reduce((n, m) => n + m.videos.length, 0);

  return (
    <div className={landing.page}>
      <a className={landing.skip} href="#explore">
        Skip to demos
      </a>
      <NavBar
        tone={overDark ? "dark" : "light"}
        user={user}
        current="demos"
        home={false}
      />

      <main id="main">
        {/* ── Hero ── */}
        <section className={s.hero} data-nav-dark aria-labelledby="pd-title">
          <div className={`${s.wrap} ${s.heroGrid}`}>
            <div>
              <p className={s.eyebrow}>Interactive Product Demo</p>
              <h1 id="pd-title" className={s.title}>
                Explore Praesto
              </h1>
              <p className={s.heroLead}>
                See attendance, leave, payroll, hiring and approvals working in
                the real product. Pick a module and watch a short demo, narrated
                in English or Hindi, with subtitles in either.
              </p>
              <div className={s.heroActions}>
                <a
                  href="#explore"
                  className={`${landing.cta} ${landing.ctaPrimary} ${landing.ctaRoll}`}
                  onClick={() =>
                    trackEvent("cta_click", {
                      cta_id: "explore_platform",
                      cta_location: "hero",
                    })
                  }
                >
                  <Roll>Start Exploring</Roll>
                  <span
                    className={landing.chip}
                    aria-hidden="true"
                    style={{ background: "var(--l-night)" }}
                  >
                    <Arrow />
                  </span>
                </a>
                {!signedIn && (
                  <Link
                    to="/book-demo"
                    className={`${landing.cta} ${landing.ctaGhost}`}
                    onClick={() =>
                      trackEvent("cta_click", {
                        cta_id: "book_demo",
                        cta_location: "hero",
                      })
                    }
                  >
                    <Roll>Book a Live Demo</Roll>
                  </Link>
                )}
              </div>
              <ul className={s.heroFacts}>
                <li>
                  <Icon name="play" size={14} /> {totalVideos} short demos
                </li>
                <li>
                  <Icon name="chat" size={14} /> Narrated in English and हिन्दी
                </li>
                <li>
                  <Icon name="checkCircle" size={14} /> No sign-up needed
                </li>
              </ul>
            </div>
            <figure className={s.heroShot}>
              <img
                src="/images/product-showcase/today-1440.webp"
                srcSet="/images/product-showcase/today-720.webp 720w, /images/product-showcase/today-1440.webp 1440w"
                sizes="(max-width: 900px) 92vw, 600px"
                alt="Praesto’s Today screen: hours worked, a month of attendance and requests awaiting a decision."
                width={1440}
                height={900}
                fetchPriority="high"
              />
              <button
                type="button"
                className={s.heroPlay}
                onClick={() => watch(MODULES[0], MODULES[0].videos[0])}
                aria-label={`Play: ${MODULES[0].videos[0].title}`}
              >
                <span>
                  <PlayGlyph size={30} />
                </span>
              </button>
            </figure>
          </div>
        </section>

        {/* ── Module explorer and player ── */}
        <section
          id="explore"
          className={s.explorer}
          aria-labelledby="pd-explore"
        >
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <h2 id="pd-explore" className={s.h2}>
                Choose what you’d like to see.
              </h2>
              <p className={s.lead}>
                Each demo is a minute or less and covers one task, recorded in
                Praesto itself. The organisation, people and figures in them are
                fictional.
              </p>
            </div>

            <ul className={s.modules} role="tablist" aria-label="Modules">
              {MODULES.map((m) => (
                <li key={m.id} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    id={`pd-tab-${m.id}`}
                    aria-selected={m.id === mod.id}
                    aria-controls="pd-panel"
                    className={s.module}
                    onClick={() => select(m)}
                  >
                    <span className={s.moduleIcon}>
                      <Icon name={m.icon as IconName} size={18} />
                    </span>
                    <span className={s.moduleName}>{m.title}</span>
                    <span className={s.moduleCount}>
                      {m.videos.length}{" "}
                      {m.videos.length === 1 ? "demo" : "demos"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div
              id="pd-panel"
              role="tabpanel"
              aria-labelledby={`pd-tab-${mod.id}`}
            >
              <div className={s.moduleIntro}>
                <h3>{mod.title}</h3>
                <p>{mod.description}</p>
              </div>

              <div
                ref={theatreRef}
                className={s.theatre}
                style={{ scrollMarginTop: 72 }}
              >
                <div>
                  {CDN_CONFIGURED ? (
                    <HlsPlayer
                      ref={player}
                      video={video}
                      onTime={setTime}
                      chaptersSlot={
                        <div className={s.fsChapters} aria-label="Chapters">
                          {video.chapters.map((c, i) => (
                            <button
                              key={c.startTime}
                              type="button"
                              aria-current={i === active}
                              onClick={() => player.current?.seek(c.startTime)}
                            >
                              {clock(c.startTime)} · {c.title}
                            </button>
                          ))}
                        </div>
                      }
                    />
                  ) : (
                    <p className={s.notice} role="status">
                      The demo videos aren’t available right now. Please try
                      again later, or{" "}
                      <Link to="/book-demo">book a live demo</Link>.
                    </p>
                  )}
                  <div className={s.nowPlaying}>
                    <h3>{video.title}</h3>
                    <p className={s.nowMeta}>
                      <span>{mod.title}</span>
                      <span className="px-num">{clock(video.duration)}</span>
                      <span>{video.chapters.length} chapters</span>
                    </p>
                    <p>{video.description}</p>
                  </div>
                </div>

                <aside className={s.side} aria-label="About this demo">
                  <div className={s.panel}>
                    <h4 className={s.panelHead}>
                      Chapters <span>{video.chapters.length}</span>
                    </h4>
                    <ol className={s.chapters}>
                      {video.chapters.map((c, i) => (
                        <li key={c.startTime}>
                          <button
                            type="button"
                            className={s.chapter}
                            aria-current={i === active}
                            onClick={() => {
                              setTime(c.startTime);
                              player.current?.seek(c.startTime);
                            }}
                            aria-label={`${c.title}, at ${clock(c.startTime)}`}
                          >
                            <span className={s.chapterTime}>
                              {clock(c.startTime)}
                            </span>
                            <span>{c.title}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {mod.videos.length > 1 && (
                    <div className={s.panel}>
                      <h4 className={s.panelHead}>
                        In {mod.title} <span>{mod.videos.length} demos</span>
                      </h4>
                      <ul className={s.playlist}>
                        {mod.videos.map((v) => (
                          <li key={v.id}>
                            <button
                              type="button"
                              className={s.playlistItem}
                              aria-current={v.id === video.id}
                              onClick={() =>
                                v.id === video.id ? undefined : watch(mod, v)
                              }
                            >
                              <Thumb video={v} now={v.id === video.id} />
                              <span>
                                <strong>{v.title}</strong>
                                <small className="px-num">
                                  {clock(v.duration)}
                                </small>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </aside>
              </div>
            </div>
          </div>
        </section>

        {/* ── More to explore ── */}
        <section className={s.more} aria-labelledby="pd-more">
          <div className={s.wrap}>
            <h2 id="pd-more" className={s.h2}>
              More to explore.
            </h2>
            <ul className={s.cards}>
              {related.map(({ video: v, module: m }) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={s.card}
                    onClick={() => watch(m, v)}
                  >
                    <Thumb video={v} />
                    <span>
                      <span className={s.cardModule}>{m.title}</span>
                      <h3>{v.title}</h3>
                      <p>{v.description}</p>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Conversion ── */}
        <section className={s.closing} data-nav-dark aria-labelledby="pd-cta">
          <div className={s.wrap}>
            <h2 id="pd-cta" className={s.h2}>
              See it with your own team.
            </h2>
            <p className={s.lead}>
              Start a free trial and set Praesto up to your organisation’s
              rules, or book a live demo with our team.
            </p>
            <div className={s.heroActions}>
              <Link
                to={signedIn ? "/dashboard" : "/login"}
                className={`${landing.cta} ${landing.ctaPrimary} ${landing.ctaRoll}`}
                onClick={() =>
                  !signedIn &&
                  trackEvent("sign_up_click", {
                    cta_id: "start_trial",
                    cta_location: "closing",
                  })
                }
              >
                <Roll>{signedIn ? "Open Dashboard" : "Start Free Trial"}</Roll>
                <span
                  className={landing.chip}
                  aria-hidden="true"
                  style={{ background: "var(--l-night)" }}
                >
                  <Arrow />
                </span>
              </Link>
              <Link
                to="/book-demo"
                className={`${landing.cta} ${landing.ctaGhost}`}
                onClick={() =>
                  trackEvent("cta_click", {
                    cta_id: "book_demo",
                    cta_location: "closing",
                  })
                }
              >
                <Roll>Book a Demo</Roll>
              </Link>
              <Link
                to="/contact"
                className={`${landing.cta} ${landing.ctaGhost}`}
                onClick={() =>
                  trackEvent("cta_click", {
                    cta_id: "contact_sales",
                    cta_location: "closing",
                  })
                }
              >
                <Roll>Contact Sales</Roll>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer signedIn={signedIn} home={false} />
    </div>
  );
}

function Thumb({ video, now }: { video: DemoVideo; now?: boolean }) {
  return (
    <span className={s.thumbBox}>
      {CDN_CONFIGURED && (
        <img
          src={cdn(video.thumbnail)}
          alt=""
          loading="lazy"
          decoding="async"
          width={1280}
          height={720}
        />
      )}
      {now && <span className={s.nowBadge}>Now Playing</span>}
      <span className={`${s.duration} px-num`}>{clock(video.duration)}</span>
    </span>
  );
}
