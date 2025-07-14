import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { navigateWithKeyboard } from "../utils/navigateWithKeyboard";

function useNavigateWithKeyboard() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event) => navigateWithKeyboard(event, navigate);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigate]);
}

export default useNavigateWithKeyboard;
