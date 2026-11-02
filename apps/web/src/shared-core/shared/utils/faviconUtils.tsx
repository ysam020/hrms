// Puts back the plain icon after updateFaviconWithDot, which swaps it for a
// data: URL. Runs on every signed-out page load, where there is usually no
// dot to clear, so it must not redraw anything: decoding the multi-size
// favicon.ico into a canvas was a long main-thread task on the landing page.
// The title is left alone; each page sets its own (src/app/seo.ts, ui/Page).
export const clearFaviconDot = () => {
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (link?.href.startsWith("data:")) link.href = "/favicon.ico";
};

export const updateFaviconWithDot = (showDot) => {
  const originalFavicon = "/favicon.ico";
  const canvas = document.createElement("canvas");
  const img = document.createElement("img");

  img.src = originalFavicon;
  img.onload = () => {
    const size = 32;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, size, size);

    if (showDot) {
      ctx.fillStyle = "#F15C6D";
      ctx.beginPath();
      ctx.arc(size - 6, 6, 6, 0, 2 * Math.PI);
      ctx.fill();
    }

    const newFavicon = canvas.toDataURL("image/png");
    const link =
      document.querySelector<HTMLLinkElement>("link[rel='icon']") ||
      (document.createElement("link") as HTMLLinkElement);
    link.rel = "icon";
    link.href = newFavicon;
    document.head.appendChild(link);
  };

  img.onerror = () => {
    console.warn("Failed to load favicon, using default");
    // Still update the title even if favicon fails
  };
};

export const updateDocumentTitle = (notificationCount) => {
  document.title = `${
    notificationCount > 0 ? `(${notificationCount}) ` : ""
  } HRMS`;
};
