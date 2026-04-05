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
      }}
    >
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </PrimeReactProvider>
  </BrowserRouter>,
);
