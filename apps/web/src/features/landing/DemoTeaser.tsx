import { Link } from "react-router-dom";
import { trackEvent } from "@next/app/analytics";
import {
  MODULES as DEMO_MODULES,
  clock,
} from "@next/features/product-demo/catalogue";
import { Reveal, RevealItem, stagger } from "./motion";
import { Arrow, Roll } from "./SiteChrome";
import s from "./landing.module.css";
import d from "./demoTeaser.module.css";

/**
 * The landing page's way into /product-demo: four modules as cards, each
 * opening its featured demo, and a button to the full library. The images
 * are the landing page's own product screenshots (always available, unlike
 * the video thumbnails, which come from the media host), so the section
 * never depends on VITE_PRODUCT_DEMO_CDN_URL.
 */
const SHOT = "/images/product-showcase";
const FEATURED: { module: string; shot: string }[] = [
  { module: "overview", shot: "today" },
  { module: "attendance", shot: "attendance" },
  { module: "payroll", shot: "payroll" },
  { module: "security", shot: "permissions" },
];

function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.9-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DemoTeaser() {
  const cards = FEATURED.flatMap(({ module, shot }) => {
    const m = DEMO_MODULES.find((x) => x.id === module);
    return m ? [{ m, shot }] : [];
  });
  const videos = DEMO_MODULES.reduce((n, m) => n + m.videos.length, 0);
  const others = DEMO_MODULES.filter(
    (m) => !FEATURED.some((f) => f.module === m.id),
  ).map((m) => m.title);

  return (
    <section
      id="demos"
      className={`${s.section} ${d.section}`}
      data-nav="demos"
      aria-labelledby="demos-title"
    >
      <Reveal className={s.galleryHead}>
        <h2 id="demos-title" className={s.h2}>
          See them in action.
        </h2>
        <p className={s.lead}>
          Short recordings of the real product, module by module, narrated in
          English or Hindi. No sign-up needed.
        </p>
      </Reveal>

      <Reveal
        as="ul"
        className={d.grid}
        kind="group"
        delay={0.06}
        stagger={stagger.items}
      >
        {cards.map(({ m, shot }) => {
          const total = m.videos.reduce((n, v) => n + v.duration, 0);
          return (
            <RevealItem as="li" key={m.id}>
              <Link
                to={`/product-demo?v=${m.videos[0].id}`}
                className={d.card}
                onClick={() =>
                  trackEvent("cta_click", {
                    cta_id: "explore_platform",
                    cta_location: "demos",
                  })
                }
              >
                <span className={d.shot}>
                  <img
                    src={`${SHOT}/${shot}-720.webp`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={720}
                    height={450}
                  />
                  <span className={d.play} aria-hidden="true">
                    <PlayGlyph />
                  </span>
                </span>
                <span className={d.body}>
                  <span className={d.title}>{m.title}</span>
                  <span className={d.meta}>
                    {m.videos.length} {m.videos.length === 1 ? "demo" : "demos"}
                    {" · "}
                    <span className="px-num">{clock(total)}</span>
                  </span>
                  <span className={d.first}>{m.videos[0].title}</span>
                </span>
              </Link>
            </RevealItem>
          );
        })}
      </Reveal>

      <Reveal className={d.foot} delay={0.1}>
        <p className={d.more}>
          {videos} demos in all, including {others.slice(0, -1).join(", ")} and{" "}
          {others.at(-1)}.
        </p>
        <Link
          to="/product-demo"
          className={`${s.cta} ${s.ctaPrimary} ${s.ctaRoll}`}
          onClick={() =>
            trackEvent("cta_click", {
              cta_id: "explore_platform",
              cta_location: "demos",
            })
          }
        >
          <Roll>Watch the Demos</Roll>
          <span
            className={s.chip}
            aria-hidden="true"
            style={{ background: "var(--l-night)" }}
          >
            <Arrow />
          </span>
        </Link>
      </Reveal>
    </section>
  );
}
