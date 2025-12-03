import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: true,  // Listen on all network interfaces (accessible via IP)
    port: 8080,
    strictPort: false,
    allowedHosts: ["crystalbudget.net", "www.crystalbudget.net"],
  },
  preview: {
    host: true,  // Listen on all network interfaces (accessible via IP)
    port: 8080,
    strictPort: false,
    allowedHosts: ["crystalbudget.net", "www.crystalbudget.net"],
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime"],
  },
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
}));
