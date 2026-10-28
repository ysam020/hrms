export const clearFaviconDot = () => {
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

    const newFavicon = canvas.toDataURL("image/png");
    const link =
      document.querySelector<HTMLLinkElement>("link[rel='icon']") ||
      (document.createElement("link") as HTMLLinkElement);
    link.rel = "icon";
    link.href = newFavicon;
    document.head.appendChild(link);
  };

  // Also reset the document title
  document.title = "HRMS";
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
