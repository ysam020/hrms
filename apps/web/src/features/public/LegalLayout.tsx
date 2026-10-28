import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import s from "./public.module.css";

/**
 * Stands in for Classic's pages/legal/LegalPageLayout (see the
 * praesto-legal-layout plugin in vite.config.ts), so the policy prose stays
 * in one place and renders in this app's reading layout.
 */
export default function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · Praesto`;
  }, [title]);
  return (
    <div className={s.publicPage}>
      <header className={s.publicBar}>
        <Link to="/" className={s.brand}>
          <span className={s.glyph}>P</span> Praesto
        </Link>
        <nav className={s.legalNav} aria-label="Policies">
          <Link to="/privacy-policy">Privacy</Link>
          <Link to="/terms-of-use">Terms</Link>
          <Link to="/refund-policy">Refunds</Link>
        </nav>
      </header>
      <article className={s.legal}>
        <h1 className="px-display">{title}</h1>
        <p className="px-meta">Last updated {lastUpdated}</p>
        <div className={s.prose}>{children}</div>
      </article>
    </div>
  );
}
