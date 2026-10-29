import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import "./index.css";

createRoot(document.getElementById("root")!).render(<ThemeProvider><AuthCallbackPage /></ThemeProvider>);
