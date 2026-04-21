import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router-dom";

export const OPEN_COMMAND_PALETTE_EVENT = "daf:open-command-palette";

export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useHotkeys("meta+slash,ctrl+slash", (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
  }, { enableOnFormTags: false });

  useHotkeys("g>d", () => navigate("/dashboard"), { enableOnFormTags: false });
  useHotkeys("g>t", () => navigate("/travelers"), { enableOnFormTags: false });
  useHotkeys("g>m", () => navigate("/destinations"), { enableOnFormTags: false });
  useHotkeys("g>s", () => navigate("/settings"), { enableOnFormTags: false });
  useHotkeys("g>r", () => navigate("/reports"), { enableOnFormTags: false });

  useHotkeys("shift+slash", () => {
    navigate("/settings");
    setTimeout(() => {
      document.getElementById("keyboard-shortcuts")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, { enableOnFormTags: false });
}
