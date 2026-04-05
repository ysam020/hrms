import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const LENS_SIZE = 150;
const ZOOM = 2.5;
const HALF = LENS_SIZE / 2;

export default function DomMagnifier({ enabled = true }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const lensInnerRef = useRef<HTMLDivElement | null>(null);
  const cloneRef = useRef<HTMLElement | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);

  const applyOffset = (x: number, y: number, node: HTMLElement | null) => {
    const el = node || cloneRef.current;
    if (!el) return;
    el.style.top = `${HALF - y * ZOOM}px`;
    el.style.left = `${HALF - x * ZOOM}px`;
  };

  const buildClone = () => {
    const root = document.getElementById("root");
    const container = lensInnerRef.current;
    if (!root || !container) return;

    const clone = root.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");

    const nested = clone.querySelector("[data-dom-magnifier-lens]");
    if (nested) nested.remove();

    Object.assign(clone.style, {
      position: "absolute",
      top: "0px",
      left: "0px",
      width: root.offsetWidth + "px",
      transformOrigin: "0 0",
      transform: `scale(${ZOOM})`,
      pointerEvents: "none",
      margin: "0",
      maxHeight: "none",
      maxWidth: "none",
    });

    container.innerHTML = "";
    container.appendChild(clone);
    cloneRef.current = clone;

    if (posRef.current) {
      applyOffset(posRef.current.x, posRef.current.y, clone);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    buildClone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const root = document.getElementById("root");
    if (!root) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(buildClone, 80);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: MouseEvent) => {
      const p = { x: e.clientX, y: e.clientY };
      posRef.current = p;
      setPos(p);
      applyOffset(e.clientX, e.clientY, null);
    };

    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!enabled) return null;

  const lensLeft = pos
    ? Math.min(Math.max(pos.x - HALF, 0), window.innerWidth - LENS_SIZE)
    : -9999;
  const lensTop = pos
    ? Math.min(Math.max(pos.y - HALF, 0), window.innerHeight - LENS_SIZE)
    : -9999;

  const lens = (
    <div
      data-dom-magnifier-lens="true"
      style={{
        position: "fixed",
        left: lensLeft,
        top: lensTop,
        width: LENS_SIZE,
        height: LENS_SIZE,
        borderRadius: "4px",
        overflow: "hidden",
        border: "2.5px solid rgba(80,80,80,0.55)",
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.28)",
        pointerEvents: "none",
        zIndex: 2147483647,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div
        ref={lensInnerRef}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          borderRadius: "2px",
        }}
      />

      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 10,
          fontSize: 9,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.7)",
          background: "rgba(0,0,0,0.38)",
          padding: "1px 4px",
          borderRadius: 3,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {ZOOM}×
      </div>
    </div>
  );

  return createPortal(lens, document.body);
}
