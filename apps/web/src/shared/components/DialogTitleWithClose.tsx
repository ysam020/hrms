import React from "react";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

/**
 * Drop-in replacement for DialogTitle that adds a close (X) icon —
 * paired with ignoreBackdropClick, this is how form/content dialogs are
 * made dismissible only via the icon or Escape, not a backdrop click.
 *
 * `children` is rendered directly (not wrapped in an extra element) so it
 * stays a direct child of .MuiDialogTitle-root — tests and styling that
 * target the title text that way keep working unchanged.
 */
function DialogTitleWithClose({
  onClose,
  children,
  sx = {},
  ...props
}: {
  onClose: () => void;
  children: React.ReactNode;
  sx?: any;
  [key: string]: any;
}) {
  return (
    <DialogTitle
      {...props}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        ...sx,
      }}
    >
      {children}
      <IconButton
        aria-label="Close"
        onClick={onClose}
        size="small"
        sx={{ color: "text.secondary", flexShrink: 0 }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </DialogTitle>
  );
}

export default React.memo(DialogTitleWithClose);
