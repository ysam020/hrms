import { useRef, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { trackEvent } from "@next/app/analytics";
import { Arrow, Roll } from "./SiteChrome";
import { showcaseSrcSet } from "./MacBookShowcase";
import {
  MaskedLines,
  Reveal,
  useAmbient,
  useEntrance,
  useSpotlight,
} from "./motion";
import s from "./landing.module.css";

// Pieces the landing page and the section pages (Sections.tsx, Pages.tsx)
// both use: real screenshots, spotlit sections and the closing call to action.

export const SHOT = "/images/product-showcase";

/**
 * A real screen, cropped to the part worth showing — never stretched.
 * `crop` is a region of the 1440 × 900 capture (CSS pixels); the frame takes
 * that region's ratio and the image is scaled uniformly to fill it.
 */
export function Shot({
  src,
  alt,
  crop = { x: 0, y: 0, w: 1440, h: 900 },
}: {
  src: string;
  alt: string;
  crop?: { x: number; y: number; w: number; h: number };
}) {
  return (
    <figure className={s.shot} style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
      <img
        src={src}
        // Zoomed into a crop, the screenshot is drawn `1440 / crop.w` times
        // the frame's width, and no frame is wider than ~1180 px.
        srcSet={showcaseSrcSet(src)}
        sizes={`calc(${(1440 / crop.w).toFixed(2)} * min(100vw, 1180px))`}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={1440}
        height={900}
        style={{
          width: `${(1440 / crop.w) * 100}%`,
          transform: `translate(${(-crop.x / 1440) * 100}%, ${(-crop.y / 900) * 100}%)`,
        }}
      />
    </figure>
  );
}

/** A section that can carry a pointer spotlight; its ambient loops pause off screen. */
export function LitSection({
  spotlight = false,
  children,
  ...props
}: { spotlight?: boolean; children: ReactNode } & ComponentProps<"section">) {
  const ref = useRef<HTMLElement>(null);
  useAmbient(ref);
  useSpotlight(spotlight ? ref : NO_REF);
  return (
    <section ref={ref} {...props}>
      {children}
    </section>
  );
}

const NO_REF = { current: null };

/** The closing line rises the way the hero's did, bookending the page. */
function ClosingTitle() {
  const ref = useRef<HTMLHeadingElement>(null);
  const state = useEntrance(ref);
  return (
    <h2 ref={ref} id="closing-title" className={s.closingTitle}>
      <MaskedLines
        lines={["Bring your people", "operations together."]}
        play={state}
        lineClassName={s.line}
        innerClassName={s.lineInner}
      />
    </h2>
  );
}

/** The closing call to action. */
export function Closing({ signedIn }: { signedIn: boolean }) {
  return (
    <LitSection
      className={s.closing}
      data-nav-dark
      aria-labelledby="closing-title"
    >
      <div className={s.aurora} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={s.closingInner}>
        <ClosingTitle />
        <Reveal className={s.closingInner} delay={0.36}>
          <p className={s.lead}>
            {signedIn
              ? "Your workspace is ready when you are."
              : "Sign in with Google and set up your organisation in three short steps."}
          </p>
          <div className={s.actions}>
            {signedIn ? (
              <Link
                to="/dashboard"
                className={`${s.cta} ${s.ctaPrimary} ${s.ctaRoll}`}
              >
                <Roll>Open Dashboard</Roll>
                <span className={s.chip} aria-hidden="true">
                  <Arrow />
                </span>
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className={`${s.cta} ${s.ctaPrimary} ${s.ctaRoll}`}
                  onClick={() =>
                    trackEvent("sign_up_click", {
                      cta_id: "start_trial",
                      cta_location: "closing",
                    })
                  }
                >
                  <Roll>Start Free Trial</Roll>
                  <span className={s.chip} aria-hidden="true">
                    <Arrow />
                  </span>
                </Link>
                <Link
                  to="/book-demo"
                  className={`${s.cta} ${s.ctaGhost}`}
                  onClick={() =>
                    trackEvent("cta_click", {
                      cta_id: "book_demo",
                      cta_location: "closing",
                    })
                  }
                >
                  <Roll>Book a Demo</Roll>
                </Link>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </LitSection>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────
