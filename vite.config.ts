import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg"],
  },
  worker: {
    rollupOptions: {
      output: {
        // AudioWorkletGlobalScope has globalThis but does not consistently
        // expose the Worker-only `self` alias used by Vite's URL shim.
        banner: "var self = globalThis;",
      },
    },
  },

  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/electron-dist/**", "**/release/**"],
    },
  },
}));
