import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { localApi } from "./server/dev-api";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env } as Record<string, string>;
  return {
    plugins: [react(), localApi(env)],
  };
});
