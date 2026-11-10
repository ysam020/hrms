import { useContext, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { trackEvent } from "@next/app/analytics";
import { Arrow, Footer, NavBar, Roll } from "../landing/SiteChrome";
import landing from "../landing/landing.module.css";
import {
  CDN_CONFIGURED,
  ORDER,
  chapterAt,
  clock,
  watchPath,
} from "./catalogue";
import { HlsPlayer, type Neighbour, type PlayerHandle } from "./HlsPlayer";
import { Thumb } from "./Thumb";
import { useChapterRow } from "./useChapterRow";
import s from "./productDemo.module.css";
import w from "./watch.module.css";

/**
 * /watch/<id>: one product video on its own page. It's what the player's
 * Share button copies, and the build prerenders one per video with that
 * video's title, description and thumbnail, so a pasted link previews as
 * the video (scripts/prerender.mjs).
 */
export default function Watch() {
  const { user } = useContext(UserContext);
  const signedIn = Boolean(user);
  const navigate = useNavigate();
  // From the path rather than useParams, so the build's prerender (which
  // renders this without a route table) sees the same id.
  const id = decodeURIComponent(useLocation().pathname.split("/")[2] ?? "");
  const at = ORDER.findIndex((x) => x.video.id === id);
  const player = useRef<PlayerHandle>(null);
  const [time, setTime] = useState(0);
  const active = at < 0 ? 0 : chapterAt(ORDER[at].video.chapters, time);
  const chapterRow = useChapterRow(active);

  if (at < 0) return <Navigate to="/product-demo" replace />;
  const { module: mod, video } = ORDER[at];

  const neighbour = (i: number): Neighbour | null => {
    const x = ORDER[i];
    return x
      ? {
          id: x.video.id,
          title: x.video.title,
          module: x.module.title,
          thumbnail: x.video.thumbnail,
          duration: x.video.duration,
        }
      : null;
  };
  const goTo = (i: number) => {
    const x = ORDER[i];
    if (!x) return;
    setTime(0);
    navigate(watchPath(x.video.id), { preventScrollReset: true });
    requestAnimationFrame(() => player.current?.seek(0));
  };
  const upNext = ORDER.slice(at + 1, at + 5);

  return (
    <div className={landing.page}>
      {/* In the browser only: the prerender writes the title into <head>. */}
      {typeof document !== "undefined" && (
        <title>{`${video.title} · Praesto`}</title>
      )}
      <NavBar tone="light" user={user} current="demos" />

      <main id="main" className={w.main}>
        <div className={s.wrap}>
          <nav className={w.crumbs} aria-label="Breadcrumb">
            <Link to="/product-demo">Product demos</Link>
            <span aria-hidden="true">/</span>
            <Link to={`/product-demo?v=${video.id}#explore`}>{mod.title}</Link>
          </nav>

          <div className={s.theatre}>
            <div>
              {CDN_CONFIGURED ? (
                <HlsPlayer
                  ref={player}
                  video={video}
                  onTime={setTime}
                  next={neighbour(at + 1)}
                  prev={neighbour(at - 1)}
                  onNext={() => goTo(at + 1)}
                  onPrev={() => goTo(at - 1)}
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
                  This video isn’t available right now. Please try again later,
                  or <Link to="/book-demo">book a live demo</Link>.
                </p>
              )}
              <div className={s.nowPlaying}>
                <h1 className={w.title}>{video.title}</h1>
                <p className={s.nowMeta}>
                  <span>{mod.title}</span>
                  <span className="px-num">{clock(video.duration)}</span>
                  <span>{video.chapters.length} chapters</span>
                  <span>English or हिन्दी</span>
                </p>
                <p>{video.description}</p>
              </div>
            </div>

            <aside className={s.side} aria-label="About this video">
              <div className={s.panel}>
                <h2 className={s.panelHead}>
                  Chapters <span>{video.chapters.length}</span>
                </h2>
                <ol ref={chapterRow} className={s.chapters}>
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
              {upNext.length > 0 && (
                <div className={s.panel}>
                  <h2 className={s.panelHead}>Up Next</h2>
                  <ul className={s.playlist}>
                    {upNext.map(({ video: v }) => (
                      <li key={v.id}>
                        <Link
                          to={watchPath(v.id)}
                          className={s.playlistItem}
                          preventScrollReset
                        >
                          <Thumb video={v} />
                          <span>
                            <strong>{v.title}</strong>
                            <small className="px-num">
                              {clock(v.duration)}
                            </small>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>

          <div className={w.more}>
            <p>
              {ORDER.length} videos cover every part of Praesto, module by
              module.
            </p>
            <div className={s.heroActions}>
              <Link
                to="/product-demo"
                className={`${landing.cta} ${landing.ctaGhost}`}
                onClick={() =>
                  trackEvent("cta_click", {
                    cta_id: "explore_platform",
                    cta_location: "demos",
                  })
                }
              >
                <Roll>All Product Demos</Roll>
              </Link>
              <Link
                to={signedIn ? "/dashboard" : "/login"}
                className={`${landing.cta} ${landing.ctaPrimary} ${landing.ctaRoll}`}
                onClick={() =>
                  !signedIn &&
                  trackEvent("sign_up_click", {
                    cta_id: "start_trial",
                    cta_location: "demos",
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
            </div>
          </div>
        </div>
      </main>
      <Footer signedIn={signedIn} />
    </div>
  );
}
