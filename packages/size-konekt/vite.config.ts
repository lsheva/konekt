import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    exclude: ["konekt"],
  },
  build: {
    sourcemap: false,
    reportCompressedSize: false,
    manifest: true,
  },
});
