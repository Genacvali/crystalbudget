import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",  // Bind to all network interfaces
    port: 8080,
    allowedHosts: [
      "crystalbudget.net",
      "www.crystalbudget.net",
      "localhost",
      "139.59.131.34"
    ],
  },
  preview: {
    host: "0.0.0.0",  // Bind to all network interfaces
    port: 8080,
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
    force: true,
  },
}));
