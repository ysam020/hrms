import { useEffect } from "react";

function useUpdateFavicon(data) {
  useEffect(() => {
    document.title = `${
      data.length > 0 ? `(${data.length}) ` : ""
    } Paymaster Management Solution Ltd.`;
    updateFavicon(data.length > 0);
  }, [data]);

  const updateFavicon = (showDot) => {
    const originalFavicon = "/favicon.ico";
    const canvas = document.createElement("canvas");
    const img = document.createElement("img");

    img.src = originalFavicon;
    img.onload = () => {
      const size = 32;
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);

      if (showDot) {
        ctx.fillStyle = "#F15C6D";
        ctx.beginPath();
        ctx.arc(size - 6, 6, 6, 0, 2 * Math.PI);
        ctx.fill();
      }

      const newFavicon = canvas.toDataURL("image/png");
      const link =
        document.querySelector("link[rel='icon']") ||
        document.createElement("link");
      link.rel = "icon";
      link.href = newFavicon;
      document.head.appendChild(link);
    };
  };
}

export default useUpdateFavicon;
