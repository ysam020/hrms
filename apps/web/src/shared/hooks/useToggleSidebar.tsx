import { useEffect } from "react";
import { toggleSidebar } from "@web/core/shortcuts";

function useToggleSidebar(setShowSidebar) {
  useEffect(() => {
    const handler = (e) => toggleSidebar(e, setShowSidebar);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);
}

export default useToggleSidebar;
