import React from "react";
import ReactDOM from "react-dom/client";
import "./index.scss";
import App from "./app/App";
import { BrowserRouter } from "react-router-dom";
import "primereact/resources/themes/lara-light-cyan/theme.css";
import "primeicons/primeicons.css";
import { PrimeReactProvider } from "primereact/api";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter
    future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    }}
  >
    <PrimeReactProvider
      value={{
        hideOverlaysOnDocumentScrolling: true,
        ripple: true,
        inputStyle: "outlined",
        autoZIndex: true,
        // MUI's Modal (and its Backdrop) sits at z-index 1300 by default.
        // PrimeReact's own defaults (overlay/menu: 1000, modal/tooltip:
        // 1100) are lower, so any PrimeReact popup — Calendar, Dropdown,
        // AutoComplete — appended outside the modal's own DOM subtree
        // (e.g. via appendTo="#root .App" to escape overflow clipping)
        // loses the raw z-index comparison and renders behind the modal.
        // Push every PrimeReact overlay category above MUI's modal layer.
        zIndex: {
          modal: 1400,
          overlay: 1400,
          menu: 1400,
          tooltip: 1400,
          toast: 1500,
        },
      }}
    >
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </PrimeReactProvider>
  </BrowserRouter>,
);
