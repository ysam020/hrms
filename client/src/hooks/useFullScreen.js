import { useEffect } from "react";

function useFullScreen() {
  useEffect(() => {
    const handleKeyDown = async (event) => {
      // Check for Shift + S (Shift key and 'S' key)
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key === "f"
      ) {
        event.preventDefault();
        const { toggleFullScreen } = await import(
          "../utils/keyboard-shortcuts/toggleFullScreen"
        );
        toggleFullScreen();
      }
    };

    // Attach event listener
    window.addEventListener("keydown", handleKeyDown);

    // Clean up the event listener on component unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}

export default useFullScreen;
