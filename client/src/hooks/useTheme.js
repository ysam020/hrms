import { useState, useEffect, useCallback, useMemo } from "react";

function useTheme() {
  const storedTheme = useMemo(
    () => JSON.parse(localStorage.getItem("theme")),
    []
  );
  const [theme, setTheme] = useState(storedTheme ?? "light");

  useEffect(() => {
    localStorage.setItem("theme", JSON.stringify(theme));
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  }, []);

  return useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
}

export default useTheme;
