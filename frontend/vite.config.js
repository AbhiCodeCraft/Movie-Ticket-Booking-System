import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (process.env.VERCEL === "1") {
    const url = new URL(env.VITE_API_BASE || "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, "") !== "/api" || ["localhost","127.0.0.1"].includes(url.hostname)) {
      throw new Error("VITE_API_BASE must be the HTTPS Render API URL ending in /api");
    }
  }
  return {
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3000",
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/tests/setup.js",
    include: ["src/**/*.test.{js,jsx}"],
  },
  };
});
