import React from "react";
import CircularProgress from "@mui/material/CircularProgress";

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
  theme = "light",
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
        backgroundColor: "#6c757d",
        color: "white",
      },
      accent: {
        backgroundColor: "#6C5DFC",
        color: "white",
      },
      danger: {
        backgroundColor: "#dc3545",
        color: "white",
      },
      warning: {
        backgroundColor: "#ffc107",
        color: "#212529",
      },
      success: {
        backgroundColor: "#28a745",
        color: "white",
      },
      outline: {
        backgroundColor: "transparent",
        color: theme === "light" ? "#111b21" : "#0c3f61",
        border: `2px solid ${theme === "light" ? "#111b21" : "#0c3f61"}`,
      },
      ghost: {
        backgroundColor: "transparent",
        color: theme === "light" ? "#111b21" : "#0c3f61",
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
    outline: "none",
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
    marginTop: "10px",
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
