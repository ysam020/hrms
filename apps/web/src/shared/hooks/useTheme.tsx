import { useState, useEffect, useCallback, useMemo } from "react";

type ThemeType = "light" | "dark";

function useTheme() {
  const [theme, setTheme] = useState<ThemeType>(() => {
    try {
      return JSON.parse(localStorage.getItem("theme") || '"light"') ?? "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    localStorage.setItem("theme", JSON.stringify(theme));
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  }, []);

  return useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
}

export default useTheme;
