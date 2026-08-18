import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TxProvider } from "./tx/TxContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TxProvider>
      <App />
    </TxProvider>
  </React.StrictMode>
);
