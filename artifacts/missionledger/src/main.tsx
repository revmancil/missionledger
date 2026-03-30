import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Make API base URL available globally for the API client
(window as any).VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

createRoot(document.getElementById("root")!).render(<App />);
