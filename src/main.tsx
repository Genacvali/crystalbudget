import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./registerSW";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker only in production
if (import.meta.env.PROD) {
  registerServiceWorker();
}

