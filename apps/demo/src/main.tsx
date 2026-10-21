import { SondoAuthProvider } from "@sondohub/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { sondo } from "./lib/sondo.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SondoAuthProvider auth={sondo} loading={<p>Carregando…</p>}>
      <App />
    </SondoAuthProvider>
  </StrictMode>,
);
