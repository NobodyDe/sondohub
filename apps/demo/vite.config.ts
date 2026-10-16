import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

const envDir = resolve(import.meta.dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");

  return {
    envDir,
    plugins: [react()],
    server: {
      port: Number(env.DEMO_PORT),
      strictPort: true,
      proxy: { "/api": `http://localhost:${env.DEMO_API_PORT}` },
    },
  };
});
