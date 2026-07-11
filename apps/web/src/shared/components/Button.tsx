import React, { useContext } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import { ThemeContext } from "@web/app/providers/ThemeContext";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "accent"
  | "danger"
  | "warning"
  | "success"
  | "outline"
  | "ghost";
type ButtonSize = "small" | "medium" | "large";

function Button({
  children,
  onClick = undefined,
  type = "button",
  loading = false,
  disabled = false,
  variant = "primary",
  size = "medium",
  icon = undefined,
  loadingText = undefined,
  fullWidth = false,
  style = {},
  className = "",
  theme = undefined,
  ...props
}: {
  [x: string]: any;
  children?: any;
  onClick?: any;
  type?: "button" | "submit" | "reset";
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant | string;
  size?: ButtonSize | string;
  icon?: any;
  loadingText?: any;
  fullWidth?: boolean;
  style?: {};
  className?: string;
  theme?: "light" | "dark";
}) {
  const appTheme = useContext(ThemeContext).theme;
  theme = theme ?? appTheme ?? "light";

  const getVariantStyles = () => {
    const variants: Record<
      string,
      {
        backgroundColor: string;
        color: string;
        border?: string;
        boxShadow?: string;
      }
    > = {
      primary: {
        backgroundColor: theme === "light" ? "#111b21" : "#0c3f61",
        color: "#fff",
      },
      secondary: {
        backgroundColor: "#565e64",
        color: "white",
      },
      accent: {
        backgroundColor: "#4c3fd4",
        color: "white",
      },
      danger: {
        backgroundColor: "#b02a37",
        color: "white",
      },
      warning: {
        backgroundColor: "#d39e00",
        color: "#212529",
      },
      success: {
        backgroundColor: "#1e7e34",
        color: "white",
      },
      outline: {
        backgroundColor: "transparent",
        color: theme === "light" ? "#111b21" : "#cacfd1",
        border: `2px solid ${theme === "light" ? "#111b21" : "#cacfd1"}`,
      },
      ghost: {
        backgroundColor: "transparent",
        color: theme === "light" ? "#111b21" : "#cacfd1",
        boxShadow: "none",
      },
    };

    return variants[variant] ?? variants.primary;
  };

  const getSizeStyles = () => {
    const sizes: Record<
      string,
      { fontSize: string; padding: string; minHeight: string }
    > = {
      small: {
        fontSize: "12px",
        padding: "6px 12px",
        minHeight: "36px",
      },
      medium: {
        fontSize: "14px",
        padding: "8px 20px",
        minHeight: "36px",
      },
      large: {
        fontSize: "16px",
        padding: "12px 24px",
        minHeight: "44px",
      },
    };

    return sizes[size] ?? sizes.medium;
  };

  const combinedStyle = {
    ...getVariantStyles(),
    ...getSizeStyles(),
    width: fullWidth ? "100%" : "auto",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.6 : 1,
    border: variant === "outline" || variant === "ghost" ? undefined : "none",
    // Don't suppress focus outlines — we restore them for keyboard users via
    // :focus-visible in the CSS. Setting outline:none here would fail WCAG 2.4.7.
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    boxShadow: variant === "ghost" ? "none" : "0 0 20px 1px rgba(0, 0, 0, 0.3)",
    transition: "all 0.2s ease-in-out",
    fontWeight: 500,
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(","),
    textTransform: "none",
    ...style,
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!loading && !disabled && onClick) {
      onClick(e);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <>
          <CircularProgress
            size={16}
            sx={{
              color: "inherit",
              marginRight: loadingText || children ? "8px" : 0,
            }}
          />
          {loadingText || children}
        </>
      );
    }

    return (
      <>
        {icon && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              margin: "0 !important",
            }}
          >
            {icon}
          </span>
        )}
        {children && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              margin: "0 !important",
            }}
          >
            {children}
          </span>
        )}
      </>
    );
  };

  return (
    <button
      type={type}
      className={`btn ${className}`.trim()}
      style={combinedStyle}
      onClick={handleClick}
      disabled={disabled || loading}
      {...props}
    >
      {renderContent()}
    </button>
  );
}

export default React.memo(Button);
