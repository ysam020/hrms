import { useEffect } from "react";
import { toggleSidebar } from "../utils/keyboard-shortcuts/toggleSidebar";

function useToggleSidebar(setShowSidebar) {
  useEffect(() => {
    window.addEventListener("keydown", (e) => toggleSidebar(e, setShowSidebar));
    return () => {
      window.removeEventListener("keydown", (e) =>
        toggleSidebar(e, setShowSidebar)
      );
    };
    // eslint-disable-next-line
  }, []);
}

export default useToggleSidebar;
