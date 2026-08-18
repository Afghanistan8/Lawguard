import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite configuration for the Lawguard frontend.
// The dev server runs on port 5173 by default; `npm run dev`.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
