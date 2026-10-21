import { AppLauncher, useSondoAuth } from "@sondohub/client";
import { useState } from "react";
import { sondo } from "./lib/sondo.ts";

export default function App() {
  const { user, logout } = useSondoAuth();
  const [result, setResult] = useState("");

  async function callApi(path: string) {
    const token = await sondo.getAccessToken();
    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setResult(`${response.status} ${await response.text()}`);
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AppLauncher />
        <strong>App Demo</strong>
        <span style={{ marginLeft: "auto" }}>
          {user.name} · nível {user.level}
        </span>
        <button onClick={logout}>Sair</button>
      </header>

      <p>
        <button onClick={() => callApi("/api/hello")}>GET /api/hello</button>
        <button onClick={() => callApi("/api/admin-only")}>
          GET /api/admin-only (nível 3)
        </button>
      </p>
      <pre>{result}</pre>
    </main>
  );
}
