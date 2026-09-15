import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/context/ThemeContext";
import { PublicPages } from "@/pages/PublicPages";
import "./index.css";

createRoot(document.getElementById("root")!).render(<ThemeProvider><PublicPages /></ThemeProvider>);
