import { useEffect, useRef } from "react";

/**
 * On narrow screens the chapter list is one horizontally scrolling row:
 * keep the current chapter in view as the video plays, scrolling the row
 * only (never the page).
 */
export function useChapterRow(active: number) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const row = ref.current;
    const item = row?.children[active] as HTMLElement | undefined;
    if (!row || !item || row.scrollWidth <= row.clientWidth) return;
    const left = item.offsetLeft - row.offsetLeft;
    const right = left + item.offsetWidth;
    if (left >= row.scrollLeft && right <= row.scrollLeft + row.clientWidth)
      return;
    row.scrollTo({ left: Math.max(0, left - 12), behavior: "smooth" });
  }, [active]);
  return ref;
}
