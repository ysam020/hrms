import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, type RouterProviderProps } from "react-router-dom";
import "./design/base.css";
import "./design/app.css";
import { router } from "./app/router";
import { applyAppearance } from "./shell/appearance";

applyAppearance();

// A focused number field steps its value on mouse-wheel, so scrolling the page
// past one silently edits it. Blurring it first lets the wheel scroll instead.
document.addEventListener(
  "wheel",
  () => {
    const el = document.activeElement;
    if (
      el instanceof HTMLInputElement &&
      el.type === "number" &&
      el.matches(":hover")
    )
      el.blur();
  },
  { passive: true },
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* The workspace override pins react-router@6.30.4 (@remix-run/router
        1.23.3) under react-router-dom@6.30.3 (1.23.2); the two Router types
        are identical patch releases, so bridge the nominal type mismatch. */}
    <RouterProvider
      router={router as unknown as RouterProviderProps["router"]}
      future={{ v7_startTransition: true }}
    />
  </React.StrictMode>,
);
