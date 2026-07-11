import React, { useContext } from "react";
import Paper from "@mui/material/Paper";
import { ThemeContext } from "@web/app/providers/ThemeContext";

function ThemedPaper({
  children,
  theme = undefined,
  elevation = 1,
  hover = false,
  sx = {},
  variant = "default",
  ...props
}: {
  children: any;
  [key: string]: any;
}) {
  const appTheme = useContext(ThemeContext).theme;
  theme = theme ?? appTheme ?? "light";

  const getThemedStyles = () => {
    const baseStyles: Record<string, any> = {
      backgroundColor: theme === "light" ? "#fff" : "#212e35",
      borderRadius: 2,
      transition: hover ? "all 0.2s ease" : "none",
    };

    if (variant === "outlined") {
      baseStyles.border = `1px solid ${
        theme === "light" ? "#e0e0e0" : "rgba(255, 255, 255, 0.12)"
      }`;
      baseStyles.boxShadow = "none";
    } else if (variant === "gradient") {
      baseStyles.background =
        theme === "light"
          ? "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)"
          : "linear-gradient(135deg, #212e35 0%, #1a252b 100%)";
    }

    if (hover) {
      baseStyles["&:hover"] = {
        transform: "translateY(-2px)",
        boxShadow:
          theme === "light"
            ? "0 4px 20px rgba(0, 0, 0, 0.15)"
            : "0 4px 20px rgba(0, 0, 0, 0.4)",
      };
    }

    return { ...baseStyles, ...sx };
  };

  return (
    <Paper
      elevation={variant === "outlined" ? 0 : elevation}
      sx={getThemedStyles()}
      {...props}
    >
      {children}
    </Paper>
  );
}

export default React.memo(ThemedPaper);
