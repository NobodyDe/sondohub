import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { defineConfig, loadEnv } from "vite";

const envDir = resolve(import.meta.dirname, "../..");

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' = lê todas as variáveis aqui no Node. Só as VITE_* vão para o navegador.
  const env = loadEnv(mode, envDir, "");

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.HUB_PORT),
      strictPort: true,
      // Front e API no mesmo origin, como vai ser em produção (hub.sondotecnica.com.br/api).
      proxy: { "/api": `http://localhost:${env.API_PORT}` },
    },
  };
});
