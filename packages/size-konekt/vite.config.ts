import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function isReact(id: string) {
  return id === "react" || id === "react-dom" || id.startsWith("react/") || id.startsWith("react-dom/");
}

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
    rolldownOptions: {
      external: isReact,
    },
  },
});
