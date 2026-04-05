import { useEffect } from "react";

// Import both themes at build time
import "primereact/resources/themes/lara-light-cyan/theme.css";
import "primereact/resources/themes/lara-dark-cyan/theme.css";

function usePrimeReactTheme(theme) {
  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("p-dark");
      document.body.classList.remove("p-light");
    } else {
      document.body.classList.add("p-light");
      document.body.classList.remove("p-dark");
    }
  }, [theme]);
}

export default usePrimeReactTheme;
